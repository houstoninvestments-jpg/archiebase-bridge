// Archie chat bridge — POST /api/chat
// Streams Claude responses back to the client as plain text chunks.
// The system prompt is composed from context/SOUL.md + context/AARON-PRIVATE.md,
// reloaded on every request so edits to those files take effect immediately.

import fs from 'node:fs';
import path from 'node:path';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1024;

// Context files that get concatenated into the system prompt, in order.
const CONTEXT_FILES = ['SOUL.md', 'AARON-PRIVATE.md'];

function loadSystemPrompt() {
  const contextDir = path.join(process.cwd(), 'context');
  const parts = [];
  for (const file of CONTEXT_FILES) {
    try {
      const content = fs.readFileSync(path.join(contextDir, file), 'utf8');
      if (content.trim()) parts.push(content.trim());
    } catch (err) {
      // Missing file is non-fatal — skip it so partial context still works.
    }
  }
  return parts.join('\n\n---\n\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  const system = loadSystemPrompt();

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        stream: true,
      }),
    });
  } catch (err) {
    res.status(502).json({ error: 'upstream fetch failed', detail: String(err) });
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    res.status(upstream.status || 502).send(text || 'upstream error');
    return;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
            res.write(evt.delta.text);
          }
        } catch {
          // ignore malformed SSE frames
        }
      }
    }
  } catch (err) {
    // Stream terminated mid-response — nothing to recover.
  }

  res.end();
}
