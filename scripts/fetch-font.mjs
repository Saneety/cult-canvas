// Downloads the latin, latin-ext and cyrillic woff2 subsets of Shantell Sans (wght 300-800) from Google Fonts
// into <dir> and writes subsets.json with each file's unicode-range. Then run scripts/embed-font.mjs <dir>.
import fs from 'node:fs';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/fetch-font.mjs <dir>'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
// Google Fonts serves woff2 only to browsers it knows.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const css = await (await fetch('https://fonts.googleapis.com/css2?family=Shantell+Sans:wght@300..800&display=swap', { headers: { 'User-Agent': UA } })).text();
const want = new Set(['latin', 'latin-ext', 'cyrillic']);
const subsets = [];
for (const [, name, body] of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
  if (!want.has(name)) continue;
  const url = body.match(/url\(([^)]+)\)\s*format\('woff2'\)/)[1];
  const range = body.match(/unicode-range:\s*([^;]+);/)[1].trim();
  if (!url.startsWith('https://fonts.gstatic.com/')) throw new Error(`unexpected font host: ${url}`);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(`${out}/${name}.woff2`, buf);
  subsets.push({ name, range, bytes: buf.length });
  console.log(name, buf.length, 'B');
}
if (subsets.length !== want.size) throw new Error(`expected ${want.size} subsets, got ${subsets.map((s) => s.name)}`);
fs.writeFileSync(`${out}/subsets.json`, JSON.stringify(subsets, null, 2));
