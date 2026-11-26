import {createGateway} from '@ai-sdk/gateway';
import {generateSpeech, transcribe} from 'ai';
import {get, put} from '@vercel/blob';

const unavailable = 'Voice is unavailable right now. You can still type to Kit.';
const river = 'SAz9YHcvj6GT2YYXdXww';
const sampleRate = 16000;

const expiry = Date.parse('2027-11-26T23:59:59Z');
const voiceModels = {speech:'elevenlabs/eleven-flash-v2.5',listen:'elevenlabs/scribe-v2'};
const limit = 4900000; // Microdollars. Leave ten cents of the approved $5 unused.

function runtimeToken(req) {
  return process.env.VERCEL_OIDC_TOKEN || req.headers['x-vercel-oidc-token'];
}

function configured(req) {
  return Date.now() < expiry && Boolean(runtimeToken(req) && process.env.BLOB_READ_WRITE_TOKEN);
}

// Charge an upper-bound reservation before each call, including failures. Compare-and-swap
// keeps parallel functions and deployments from spending the same remaining balance.
async function reserve(kind, units) {
  const prices = await fetch('https://ai-gateway.vercel.sh/v1/models', {signal:AbortSignal.timeout(5000)});
  if (!prices.ok) throw Error('Voice pricing unavailable');
  const model = (await prices.json()).data.find(m => m.id === voiceModels[kind]);
  const price = Number(model?.pricing?.[kind === 'speech' ? 'speech_input_character_cost' : 'transcription_duration_cost_per_second']);
  if (!Number.isFinite(price) || price <= 0) throw Error('Voice price missing');
  const amount = Math.max(10000, Math.ceil(units * price * 1500000));
  const path = 'kit-budget/' + new Date().toISOString().slice(0,7) + '.txt';
  const current = await get(path,{access:'private',useCache:false});
  const spent = current ? Number(await new Response(current.stream).text()) : 0;
  if (!Number.isSafeInteger(spent) || spent < 0 || spent + amount > limit) throw Error('Voice budget unavailable');
  await put(path,String(spent + amount),{
    access:'private',addRandomSuffix:false,
    ...(current ? {ifMatch:current.blob.etag} : {allowOverwrite:false})
  });
}

// Accept exactly the mono PCM layout the studio recorder writes, capped at 25 seconds.
function readRecording(encoded) {
  if (typeof encoded !== 'string' || encoded.length > 1066800) return;
  const b = Buffer.from(encoded, 'base64');
  if (b.length < 44 + 3200 || b.length > 44 + sampleRate * 2 * 25 || b.length % 2 ||
      b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
      b.readUInt32LE(4) !== b.length - 8 || b.readUInt32LE(16) !== 16 ||
      b.readUInt16LE(20) !== 1 || b.readUInt16LE(22) !== 1 ||
      b.readUInt32LE(24) !== sampleRate || b.readUInt32LE(28) !== sampleRate * 2 ||
      b.readUInt16LE(32) !== 2 || b.readUInt16LE(34) !== 16 ||
      b.toString('ascii', 36, 40) !== 'data' || b.readUInt32LE(40) !== b.length - 44) return;
  return b;
}

export async function speakReply(req,reply) {
  if (!configured(req)) return {};
  try {
    const gateway = createGateway({apiKey:runtimeToken(req)});
    await reserve('speech',Buffer.byteLength(reply,'utf8'));
    const result = await generateSpeech({
      model:gateway.speechModel(voiceModels.speech), voice:river,
      text:reply, outputFormat:'mp3', maxRetries:0, abortSignal:AbortSignal.timeout(18000)
    });
    return {audio:Buffer.from(result.audio.uint8Array).toString('base64')};
  } catch (error) {
    console.warn('Kit speech unavailable', error.statusCode || error.name);
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  const enabled = configured(req);
  if (req.method === 'GET') return res.status(200).json({enabled});
  if (req.method !== 'POST') {
    res.setHeader('Allow','GET, POST');
    return res.status(405).end();
  }
  if (!enabled) return res.status(503).json({error:unavailable});
  if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).end();
  const recording = readRecording(req.body?.recording);
  if (!recording) return res.status(400).json({error:'Try a short recording of up to 25 seconds.'});
  try {
    const gateway = createGateway({apiKey:runtimeToken(req)});
    await reserve('listen',Math.max(60, (recording.length-44)/32000));
    const result = await transcribe({
      model:gateway.transcriptionModel(voiceModels.listen), audio:recording,
      maxRetries:0, abortSignal:AbortSignal.timeout(18000)
    });
    const transcript = result.text.trim();
    if (!transcript || transcript.length > 1000) return res.status(422).json({error:'Try a shorter question or type it below.'});
    return res.status(200).json({transcript});
  } catch (error) {
    console.warn('Kit transcription unavailable', error.statusCode || error.name);
    return res.status(503).json({error:unavailable});
  }
}
