import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'dist');
const skip = new Set([
  'dist',
  'api',
  'node_modules',
  'build.mjs',
  'package.json',
  'package-lock.json',
  '.node-version',
  '.gitignore'
]);

const publicPages = [
  { loc: '/', file: 'index.html' },
  { loc: '/about.html', file: 'about.html' },
  { loc: '/tools.html', file: 'tools.html' },
  { loc: '/privacy.html', file: 'privacy.html' }
];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

async function copyTree(src, dest) {
  await mkdir(dest, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await cp(from, to);
  }
}

await copyTree(root, out);

const configSource = await readFile(path.join(root, 'site-config.js'), 'utf8');
const originMatch = configSource.match(/siteOrigin:\s*"([^"]+)"/);
if (!originMatch) throw new Error('site-config.js is missing siteOrigin.');
const origin = originMatch[1].replace(/\/$/, '');

function absolutizeHtml(html) {
  return html
    .replace(
      /(<meta\s+(?:property="og:(?:url|image)"|name="twitter:image")\s+content=")(\/[^"]*)(")/g,
      (_, start, urlPath, end) => start + origin + urlPath + end
    )
    .replace(
      /(<link\s+rel="canonical"\s+href=")(\/[^"]*)(")/g,
      (_, start, urlPath, end) => start + origin + urlPath + end
    )
    .replace(
      /("(?:url|image|@id)"\s*:\s*")(\/[^"]*)(")/g,
      (_, start, urlPath, end) => start + origin + urlPath + end
    );
}

async function absolutize(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await absolutize(file);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    const html = await readFile(file, 'utf8');
    const next = absolutizeHtml(html);
    if (next !== html) await writeFile(file, next);
  }
}

await absolutize(out);

const robots = [
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: ${origin}/sitemap.xml`,
  ''
].join('\n');
await writeFile(path.join(out, 'robots.txt'), robots);

const urlEntries = publicPages.map((page) => {
  const loc = `${origin}${page.loc}`;
  return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
}).join('\n');
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  urlEntries,
  '</urlset>',
  ''
].join('\n');
await writeFile(path.join(out, 'sitemap.xml'), sitemap);

console.log('Static files written to editorial/dist');
console.log('Open Graph origin:', origin);
console.log('Wrote robots.txt and sitemap.xml for', publicPages.length, 'public pages');
