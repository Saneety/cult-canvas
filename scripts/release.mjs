// Releases a new version: node scripts/release.mjs <version> "<release notes>" [--vault <vault folder>] [--dry-run]
// Commit the feature work first. The script checks that the plugin files have no uncommitted changes and that main
// is level with GitHub, raises the version in manifest.json and versions.json, runs the tests, commits the bump,
// pushes main and an annotated tag whose message is the release notes; .github/workflows/release.yml then tests,
// attests and publishes the release. --vault also copies the release files into that vault (scripts/install.mjs).
// --dry-run stops before anything is written.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [, value] = args.splice(i, 2);
  return value;
};
const dry = args.includes('--dry-run') && args.splice(args.indexOf('--dry-run'), 1);
const vault = flag('--vault');
const [version, notes] = args;

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
const git = (...a) =>
  execFileSync('git', [...(process.platform === 'win32' ? ['-c', 'http.sslBackend=openssl'] : []), ...a], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

if (!/^\d+\.\d+\.\d+$/.test(version || '') || !notes?.trim()) {
  fail('usage: node scripts/release.mjs <x.y.z> "<release notes>" [--vault <vault folder>] [--dry-run]');
}
const manifestPath = path.join(root, 'manifest.json');
const versionsPath = path.join(root, 'versions.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
const num = (v) => v.split('.').map(Number);
const newer = (a, b) => {
  const [x, y] = [num(a), num(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
if (!newer(version, manifest.version)) fail(`${version} is not newer than the current ${manifest.version}`);
if (vault && !fs.existsSync(path.join(vault, '.obsidian'))) fail(`${vault} is not a vault (no .obsidian folder)`);

if (git('branch', '--show-current') !== 'main') fail('release from main only');
const files = ['main.js', 'styles.css', 'main.test.js', 'manifest.json', 'versions.json'];
const dirty = git('status', '--porcelain', '--', ...files);
if (dirty) fail(`commit these first, the release must match the commit:\n${dirty}`);
git('fetch', '-q', 'origin');
const [behind] = git('rev-list', '--left-right', '--count', 'origin/main...HEAD').split(/\s+/);
if (behind !== '0') fail(`main is ${behind} commit(s) behind origin/main: pull first`);
if (git('tag', '--list', version)) fail(`tag ${version} already exists`);

console.log('tests: node main.test.js');
execFileSync(process.execPath, ['main.test.js'], { cwd: root, stdio: 'inherit' });
if (dry) {
  console.log(`dry run: ${manifest.version} -> ${version} would be released with these notes:\n${notes}`);
  process.exit(0);
}

manifest.version = version;
versions[version] = manifest.minAppVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + '\n');
git('add', 'manifest.json', 'versions.json');
git('commit', '-q', '-m', `${version}: ${notes.trim().split('\n')[0]}`);
git('tag', '-a', version, '-m', notes.trim());
git('push', '-q', 'origin', 'main');
git('push', '-q', 'origin', version);
console.log(`pushed ${version}: https://github.com/Saneety/cult-canvas/actions (the release appears when the run is green)`);

if (vault) {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'install.mjs'), vault], { stdio: 'inherit' });
}
console.log(
  'Reply in a Discussion: one plain sentence of what changed for the user, no internal details, and the link ' +
    `https://github.com/Saneety/cult-canvas/releases/tag/${version}`,
);
