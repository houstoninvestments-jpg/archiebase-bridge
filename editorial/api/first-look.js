import {speakReply, reserveVoiceReply, voiceChatModel} from './kit-voice.js';

const endpoint = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const models = ['nvidia/nemotron-3.5-lightning-free', 'reflection/beam-free'];
const studio = `You are Kit, the AI studio guide at Brick & Cursor. Aaron is the human who runs the studio.
Sound like a curious colleague pulling up a chair. Be candid, warm and specific. Answer the actual question in the first sentence. Use everyday words, contractions and concrete details from the conversation. An occasional dry observation is welcome when it fits. Skip sales language, canned enthusiasm, forced jokes and emojis.
Let the visitor lead. Remember corrections and preferences, handle a change of topic, and explain unfamiliar terms. If they just want to talk or learn, stay with them. Ask at most one question, and only when it helps. Never make someone repeat a detail they already gave you. Usually two to four short sentences are enough.
The studio offers websites, search and Maps visibility, AI coaching, agents, apps, workflow automation, monitoring, branding, publishing and email. Aaron works one-on-one. A first look is free. Aaron agrees on scope and price before paid work starts. There is no guaranteed turnaround. The project gallery includes The Archivist Method (a free resource for catching familiar reactions), The Equipment Ledger (used-equipment buying tools) and PickAPlugin (a plugin directory). The free business tools include follow-up templates.
Speak as Kit, never as Aaron. You can discuss what the visitor shares, but cannot visit links, see private systems, book work or send notes. Visitors can write straight to Aaron, or type or speak with you to work out what to ask. “Review my note for Aaron” opens an editable draft. Aaron personally receives the note only when the visitor selects “Send to Aaron.” The visitor chooses an email or text reply. Never offer a callback or imply Aaron has received the conversation. Never invent rates, clients, results, or technical access. Avoid collecting private information. For unrelated tasks, briefly steer back to what the studio helps with.`;

function validConversation(messages) {
  return Array.isArray(messages) && messages.length >= 1 && messages.length <= 17 &&
    messages.length % 2 === 1 && messages.every((m, index) =>
      m?.role === (index % 2 === 0 ? 'user' : 'assistant') &&
      typeof m.content === 'string' && m.content.trim().length > 0 &&
      m.content.length <= (m.role === 'user' ? 1000 : 1800));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: 'Use the first look form.'});
  }
  if (!req.headers['content-type']?.startsWith('application/json')) {
    return res.status(415).json({error: 'Use the first look form.'});
  }
  const {goal, question, answer} = req.body || {};
  const first = question === undefined && answer === undefined;
  const valid = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const conversation = req.body?.messages;
  const chat = conversation !== undefined;
  const validRequest = chat ? validConversation(conversation)
    : valid(goal, 500) && (first || (valid(question, 320) && valid(answer, 400)));
  if (!validRequest) {
    return res.status(400).json({error:'Please enter a short description and try again.'});
  }
  const token = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  const message = 'AI is unavailable right now. You can try again or send your note to Aaron.';
  if (!token) return res.status(503).json({error:message});
  const instruction = first
    ? 'Reply with just one short, specific follow-up question that would change your recommendation. Ask about how they work today. No preamble.'
    : 'Suggest one immediately useful, realistic first step based on their answer, including one concrete example or action they can try themselves. Stay under 75 words, plain text, no headings or follow-up questions.';
  const guidance = req.body?.voice === true ? ' This answer will be spoken aloud. Use two or three short sentences, plain text, and natural pauses. Avoid lists, links, and reading out punctuation.' : '';
  const messages = chat ? [{role:'system',content:studio + guidance}, ...conversation.map(({role,content}) => ({role,content}))] : [
    {role:'system',content:studio+' '+instruction},
    {role:'user',content:JSON.stringify(first ? {goal} : {goal,question,answer})}
  ];
  const useVoiceModel = chat && req.body.voice === true && await reserveVoiceReply(req,messages);
  for (const model of useVoiceModel ? [voiceChatModel, ...models] : models) {
    try {
      const response = await fetch(endpoint, {
        method:'POST', signal:AbortSignal.timeout(20000),
        headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
        body:JSON.stringify(model === voiceChatModel ? {model,messages,max_tokens:256} : {model,messages,reasoning_effort:'low',max_tokens:1400})
      });
      if (!response.ok) {
        console.warn('First look model unavailable', model, response.status);
        continue;
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) continue;
      if (chat) {
        if (text.length <= 1800) {
          const speech = req.body.voice === true ? await speakReply(req,text) : {};
          return res.status(200).json({reply:text, ...speech});
        }
      } else if (first) {
        const question = text.match(/[^.!?\n]*\?/u)?.[0].trim();
        if (question && question.length <= 320) return res.status(200).json({question});
      } else if (text.length <= 850) {
        return res.status(200).json({suggestion:text});
      }
    } catch {
      console.warn('First look request incomplete', model);
    }
  }
  return res.status(503).json({error:message});
}
