import {createGateway} from '@ai-sdk/gateway';
import {generateSpeech, transcribe} from 'ai';
import {get, put} from '@vercel/blob';

const unavailable = 'Voice is unavailable right now. You can still type to Kit.';
export const river = 'SAz9YHcvj6GT2YYXdXww';
const sampleRate = 16000;

const expiry = Date.parse('2027-11-26T23:59:59Z');
export const voiceChatModel = 'openai/gpt-4.1-mini';
export const voiceModels = {chat:voiceChatModel,speech:'elevenlabs/eleven-flash-v2.5',listen:'elevenlabs/scribe-v2'};
const limit = 4900000; // Microdollars. Leave ten cents of the approved $5 unused.

export function runtimeToken(req) {
  return process.env.VERCEL_OIDC_TOKEN || req.headers['x-vercel-oidc-token'];
}

export function configured(req) {
  return Date.now() < expiry && Boolean(runtimeToken(req) && process.env.BLOB_READ_WRITE_TOKEN);
}

// Charge an upper-bound reservation before each call, including failures. Compare-and-swap
// keeps parallel functions and deployments from spending the same remaining balance.
async function reserve(kind, units) {
  const prices = await fetch('https://ai-gateway.vercel.sh/v1/models', {signal:AbortSignal.timeout(5000)});
  if (!prices.ok) throw Error('Voice pricing unavailable');
  const model = (await prices.json()).data.find(m => m.id === voiceModels[kind]);
  const pricing = model?.pricing;
  const field = {speech:'speech_input_character_cost',listen:'transcription_duration_cost_per_second',chat:'input'}[kind];
  const price = Number(pricing?.[field]);
  if (!Number.isFinite(price) || price <= 0) throw Error('Voice price missing');
  const outputCost = kind === 'chat' ? 256 * Number(pricing?.output) : 0;
  const amount = Math.max(10000, Math.ceil((units * price + outputCost) * 1500000));
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('Voice pricing unavailable');
  await reserveAmount(amount);
}

async function reserveAmount(estimate) {
  const path = 'kit-budget/' + new Date().toISOString().slice(0,7) + '.txt';
  const [amount,current] = await Promise.all([estimate,get(path,{access:'private',useCache:false})]);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('Voice pricing unavailable');
  const spent = current ? Number(await new Response(current.stream).text()) : 0;
  if (!Number.isSafeInteger(spent) || spent < 0 || spent + amount > limit) throw Error('Voice budget unavailable');
  await put(path,String(spent + amount),{
    access:'private',addRandomSuffix:false,
    ...(current ? {ifMatch:current.blob.etag} : {allowOverwrite:false})
  });
}

// Reserve the complete bounded turn before starting any metered provider work.
export function reserveConversation(historyBytes, seconds) {
  return reserveAmount(conversationCost(historyBytes,seconds));
}

async function conversationCost(historyBytes,seconds) {
  const response = await fetch('https://ai-gateway.vercel.sh/v1/models',{signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw Error('Voice pricing unavailable');
  const catalog = (await response.json()).data;
  function price(model,field) {
    const value = Number(catalog.find(m => m.id === model)?.pricing?.[field]);
    if (!Number.isFinite(value) || value <= 0) throw Error('Voice pricing unavailable');
    return value;
  }
  const cost = Math.max(seconds,60) * price(voiceModels.listen,'transcription_duration_cost_per_second')
    + (historyBytes + 6500) * price(voiceChatModel,'input') + 128 * price(voiceChatModel,'output')
    + 420 * price(voiceModels.speech,'speech_input_character_cost');
  return Math.ceil(cost * 1500000);
}

export async function reserveVoiceReply(req,messages) {
  if (!configured(req)) return false;
  try {
    // One token per UTF-8 byte plus framing is a conservative ceiling for this model.
    await reserve('chat',Buffer.byteLength(JSON.stringify(messages)) + 512);
    return true;
  } catch {
    return false;
  }
}

// Accept exactly the mono PCM layout the studio recorder writes, capped at 25 seconds.
export function readRecording(encoded, seconds = 25) {
  if (typeof encoded !== 'string' || encoded.length > Math.ceil((44 + sampleRate * 2 * seconds)/3)*4) return;
  const b = Buffer.from(encoded, 'base64');
  if (b.length < 44 + 3200 || b.length > 44 + sampleRate * 2 * seconds || b.length % 2 ||
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
