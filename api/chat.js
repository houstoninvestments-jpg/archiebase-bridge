import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join } from 'path';

let soulContent = '';
try {
  soulContent = readFileSync(join(process.cwd(), 'context', 'SOUL.md'), 'utf-8');
} catch {
  soulContent = 'You are Archie, a personal AI assistant for Aaron Houston. Be direct, concise, and genuinely helpful.';
}

const SYSTEM_PROMPT = `You are Archie — Aaron Houston's personal AI. You run his operating system.

${soulContent}

RULES:
- Max 3 sentences unless Aaron asks for more.
- No filler. No sycophancy. Just help.
- You know Aaron. Act like it.
- Be direct, warm, and sharp — bartender who read Jung.
- If you don't know something, say so. Don't guess.`;

const client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Cap history to last 20 messages
  const history = messages.slice(-20);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: history,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Anthropic API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to get response from Archie' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
      res.end();
    }
  }
}
