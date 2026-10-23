// Fails if the production build contains the dev-only test hooks or the
// test clock. Run after `npm run build`.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const banned = ['__mebae', 'advanceDays', 'forgetEmulatorAnchors', 'perfStart'];
let bad = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(join(dir, f), 'utf8');
  for (const b of banned) if (src.includes(b)) {
    console.error(`dist/assets/${f} contains test-only "${b}"`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log('check-dist: no test hooks or test clock in the production build');
