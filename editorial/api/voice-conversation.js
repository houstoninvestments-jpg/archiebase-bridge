import {createGateway} from '@ai-sdk/gateway';
import {transcribe, streamText, experimental_streamSpeech as streamSpeech} from 'ai';
import {studio, validConversation} from './first-look.js';
import {configured, readRecording, reserveConversation, river, runtimeToken, speakReply, voiceChatModel, voiceModels} from './kit-voice.js';

const spokenStyle = 'You’re talking out loud with one person. Give them room to talk. Aim for about 25 words per turn. One concrete thought, occasionally a follow-up. Use contractions. Skip sales language and generic reassurance. Follow interruptions. A free first look starts with a note; Aaron takes a look himself and replies by text or email. Never imply it is a booked call or meeting. For example, if someone asks how a first look works: “Send Aaron a link and tell him what feels off. He’ll take a look for free and text or email you what he’d try first.” If someone says they have no idea where to start: “That’s okay. What’s one thing you’d happily take off your plate this week?” Match that rhythm in your own words.';

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store, no-transform');
  if (req.method === 'GET') return res.status(200).json({enabled:configured(req)});
  if (req.method !== 'POST') { res.setHeader('Allow','GET, POST'); return res.status(405).end(); }
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
      let pending = '';
      let sentences = 0;
      for await (const delta of answer.textStream) {
        pending += delta;
        // Send a complete phrase so River can start naturally and never cut off a word at the limit.
        let match;
        while ((match = pending.match(/^.*?[.!?](?=\s)/s))) {
          const sentence = match[0] + ' ';
          if ((reply + sentence).length > 420) return;
          reply += sentence;
          yield sentence;
          sentences++;
          if (sentences >= 2 || reply.trim().split(/\s+/).length >= 36) return;
          pending = pending.slice(match[0].length).trimStart();
        }
        if (pending.length + reply.length > 420) break;
      }
      if (pending.trim() && pending.length + reply.length <= 420) {
        reply += pending;
        yield pending;
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
    if (!reply.trim()) {
      const full=(await answer.text).trim();
      reply=full.length<=420 ? full : full.slice(0,417).replace(/\s+\S*$/, '')+'…';
    }
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
