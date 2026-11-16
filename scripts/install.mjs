// Copies the three release files into a vault: node scripts/install.mjs <vault folder>
// The plugin settings (data.json) in the vault stay as they are.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vault = process.argv[2];
if (!vault || !fs.existsSync(path.join(vault, '.obsidian'))) {
  console.error('usage: node scripts/install.mjs <vault folder with .obsidian>');
  process.exit(1);
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).id;
const target = path.join(vault, '.obsidian', 'plugins', id);
fs.mkdirSync(target, { recursive: true });
for (const f of ['main.js', 'manifest.json', 'styles.css']) fs.copyFileSync(path.join(root, f), path.join(target, f));
console.log('installed into', target, '- reload Obsidian (Ctrl+R) to pick it up');
