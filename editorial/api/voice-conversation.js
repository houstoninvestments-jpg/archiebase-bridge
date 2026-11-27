import {createGateway} from '@ai-sdk/gateway';
import {transcribe, streamText, experimental_streamSpeech as streamSpeech} from 'ai';
import {studio, validConversation} from './first-look.js';
import {configured, readRecording, reserveConversation, river, runtimeToken, speakReply, voiceChatModel, voiceModels} from './kit-voice.js';

const spokenStyle = 'You are in a live voice conversation. Answer the latest thought directly in one or two short sentences. Match the visitor’s pace. If they cut in, go with the new thought. Ask one question only if it helps. Use plain spoken English, no formatting, no generic preamble.';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, no-transform');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  if (!configured(req)) return res.status(503).json({error:'Voice is unavailable. You can still type to Kit.'});
  if (!req.headers['content-type']?.startsWith('application/json')) return res.status(415).end();
  const past = req.body?.history;
  const wav = readRecording(req.body?.recording,60);
  if (!wav || !Array.isArray(past) || !validConversation([...past,{role:'user',content:'voice'}])) {
    return res.status(400).json({error:'That turn couldn’t be read. Try again.'});
  }
  const history = past.map(({role,content}) => ({role,content}));
  const system = studio + ' ' + spokenStyle;
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const signal = AbortSignal.any([abort.signal,AbortSignal.timeout(50000)]);
  const send = event => { if (!signal.aborted) res.write(JSON.stringify(event)+'\n'); };
  try {
    await reserveConversation(Buffer.byteLength(system + JSON.stringify(history)),(wav.length-44)/32000);
  } catch {
    return res.status(503).json({error:'Voice is unavailable right now. You can keep chatting by typing.'});
  }
  res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders();
  try {
    const gateway = createGateway({apiKey:runtimeToken(req)});
    const heard = await transcribe({model:gateway.transcriptionModel(voiceModels.listen),audio:wav,maxRetries:0,abortSignal:signal});
    const transcript = heard.text.trim();
    if (!transcript || /^\s*[(\[][^)\]]*[)\]]\s*$/.test(transcript)) {send({type:'silence'});return;}
    if (transcript.length>1000) {send({type:'error',message:'That was a long thought. Try it in two parts.'});return;}
    send({type:'heard',text:transcript});
    const answer = streamText({model:gateway(voiceChatModel),system,messages:[...history,{role:'user',content:transcript}],
      maxOutputTokens:128,maxRetries:0,abortSignal:signal,onError:()=>{}});
    let reply = '';
    async function* words() {
      for await (const delta of answer.textStream) {
        const piece = delta.slice(0,420-reply.length);
        if (!piece) break;
        reply += piece;
        yield piece;
      }
    }
    let audioSent = false;
    try {
      const speech = streamSpeech({model:gateway.speechModel(voiceModels.speech),text:words(),voice:river,
        outputFormat:{type:'audio/pcm',rate:16000},abortSignal:signal,onError:()=>{}});
      for await (const part of speech.fullStream) {
        if (part.type === 'error') throw Error('Speech stream unavailable');
        if (part.type !== 'audio' || !part.audio.length) continue;
        if (part.audioFormat.type !== 'audio/pcm') throw Error('Unexpected voice format');
        send({type:'pcm',rate:part.audioFormat.rate||16000,audio:Buffer.from(part.audio).toString('base64')});
        audioSent = true;
      }
    } catch { if (signal.aborted) return; }
    if (!reply.trim()) reply=(await answer.text).trim().slice(0,420);
    if (!reply) throw Error('Missing reply');
    if (!audioSent && !signal.aborted) {
      const fallback = await speakReply(req,reply);
      if (fallback.audio) {send({type:'mp3',audio:fallback.audio});audioSent=true;}
    }
    send({type:'reply',text:reply,spoken:audioSent});
  } catch {
    send({type:'error',message:'Kit lost the audio connection. You can reconnect or type here.'});
  } finally { if (!res.destroyed) res.end(); }
}
