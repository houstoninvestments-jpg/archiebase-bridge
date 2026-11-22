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

async function absolutize(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await absolutize(file);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    const html = await readFile(file, 'utf8');
    const next = html.replace(
      /(<meta\s+(?:property="og:(?:url|image)"|name="twitter:image")\s+content=")(\/[^"]*)(")/g,
      (_, start, urlPath, end) => start + origin + urlPath + end
    );
    if (next !== html) await writeFile(file, next);
  }
}

await absolutize(out);
console.log('Static files written to editorial/dist');
console.log('Open Graph origin:', origin);
