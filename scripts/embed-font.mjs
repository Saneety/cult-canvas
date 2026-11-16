// Embeds the Shantell Sans woff2 subsets into main.js, between the FONT_SUBSETS_START and FONT_SUBSETS_END lines.
//   node scripts/fetch-font.mjs <dir>    downloads the subsets and subsets.json into <dir>
//   node scripts/embed-font.mjs <dir>    writes them into main.js
// Plugins are installed as main.js, manifest.json and styles.css only, so the font has to live inside main.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/embed-font.mjs <dir with subsets.json>'); process.exit(1); }
const subsets = JSON.parse(fs.readFileSync(path.join(dir, 'subsets.json'), 'utf8'));
const mainPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'main.js');
const main = fs.readFileSync(mainPath, 'utf8');
const start = main.indexOf('// FONT_SUBSETS_START\n');
const end = main.indexOf('// FONT_SUBSETS_END');
if (start < 0 || end < start) throw new Error('FONT_SUBSETS markers not found in main.js');

const entries = subsets.map((s) => {
  const data = fs.readFileSync(path.join(dir, `${s.name}.woff2`)).toString('base64');
  return `  { name: '${s.name}', range: '${s.range}', data: '${data}' },`;
});
const block = `// FONT_SUBSETS_START\nconst FONT_SUBSETS = [\n${entries.join('\n')}\n];\n`;
fs.writeFileSync(mainPath, main.slice(0, start) + block + main.slice(end));
console.log('embedded', subsets.map((s) => `${s.name} ${s.bytes} B`).join(', '), '->', fs.statSync(mainPath).size, 'B main.js');
