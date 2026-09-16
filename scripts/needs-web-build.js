// Does the exported web app in dist/ still match the source?
//
// start-web.bat asks this before rebuilding. An export takes a few minutes, and
// on a shop computer the answer is usually "nothing changed since yesterday" —
// so the difference between one click that opens in seconds and one that makes
// the counter wait is this file.
//
//   node scripts/needs-web-build.js    prints BUILD or FRESH (and exits 0)

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUILT = path.join(ROOT, 'dist', 'index.html');

/** Everything the bundle is made of. server/ is not in it — it is not bundled. */
const SOURCES = [
  'app',
  'components',
  'db',
  'modules',
  'utils',
  'web',
  'assets',
  'scripts',
  'app.json',
  'package.json',
  'metro.config.js',
  'tsconfig.json',
];

const SKIP = new Set(['node_modules', '.expo', 'dist', '__tests__']);

/** Newest mtime under a file or folder, in ms. Missing paths count as 0. */
function newestMtime(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;

  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const found = newestMtime(path.join(target, entry.name));
    if (found > newest) newest = found;
  }
  return newest;
}

function needsBuild() {
  let built;
  try {
    built = fs.statSync(BUILT).mtimeMs;
  } catch {
    return true; // Never exported.
  }
  return SOURCES.some((name) => newestMtime(path.join(ROOT, name)) > built);
}

console.log(needsBuild() ? 'BUILD' : 'FRESH');
