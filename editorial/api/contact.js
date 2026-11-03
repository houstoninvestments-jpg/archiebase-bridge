// Archiebase public business inquiries.
// The recipient is an encrypted Vercel environment variable, never sent to the browser.
const MAX_BODY_BYTES = 10_000;
const allowOrigin = new Set([
  'https://archiebase-public.vercel.app',
  'https://archiebase-editorial-2026.vercel.app',
  'https://archiebase.com',
  'https://www.archiebase.com'
]);
const clean = (value, max = 300) =>
  String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed.' });
  }
  const origin = clean(req.headers.origin, 256);
  // Vercel preview URLs remain accessible for QA; public deployment has a fixed hostname.
  if (origin && !allowOrigin.has(origin) && !/^https:\/\/archiebase-public-[a-z0-9-]+\.vercel\.app$/.test(origin) && !/^https:\/\/archiebase-editorial-2026-[a-z0-9-]+\.vercel\.app$/.test(origin)) {
    return res.status(403).json({ ok: false, error: 'Invalid website origin.' });
  }
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    return res.status(415).json({ ok: false, error: 'Expected JSON.' });
  }
  if (Number(req.headers['content-length'] || 0) > MAX_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: 'Message too large.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'Invalid form.' }); }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'Invalid form.' });
  }
  // Hidden field traps basic automated submissions.
  if (body.website) return res.status(200).json({ ok: true });
  const name = clean(body.name, 90);
  const email = clean(body.email, 180);
  const business = clean(body.business, 120);
  const issue = clean(body.issue, 150);
  const message = clean(body.message, 2000);
  if (name.length < 2 || business.length < 2 || message.length < 10 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ||
      /[\r\n]/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Please check your information and try again.' });
  }

  const recipient = process.env.CONTACT_EMAIL;
  if (!recipient) return res.status(503).json({ ok: false, error: 'Contact service is not configured.' });
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let upstream;
    try {
      upstream = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(recipient), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          _subject: 'Archiebase · New small business inquiry',
          _template: 'table',
          _captcha: 'false',
          _replyto: email,
          _url: 'https://archiebase-public.vercel.app',
          name,
          email,
          business,
          opportunity: issue || 'General help',
          message
        }),
        signal: controller.signal
      });
    } finally { clearTimeout(timer); }
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok || data.success !== 'true' && data.success !== true) {
      // Do not disclose upstream tokens, destination or third-party diagnostics.
      return res.status(502).json({ ok: false, error: 'We could not send your request. Please try again later.' });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ ok: false, error: 'We could not send your request. Please try again later.' });
  }
}
