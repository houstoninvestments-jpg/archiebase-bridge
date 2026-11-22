import { cp, mkdir, readdir, rm } from 'node:fs/promises';
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
console.log('Static files written to editorial/dist');
