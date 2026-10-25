// Runs against an already-started, slot-protected managed browser.
// This process starts no server and never terminates another runtime.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const suite = process.argv[2] ?? 'quest';
const suites = { quest: './run-quest.mjs', glasses: './run-glasses.mjs', kitchen: './run-room.mjs', perf: './run-perf.mjs' };
if (!(suite in suites)) throw new Error(`Unknown suite ${suite}. Choose ${Object.keys(suites).join(', ')}.`);
const out = resolve(process.env.MEBAE_OUT ?? 'e2e-out');
mkdirSync(out, { recursive: true });
process.env.MEBAE_OUT = out;
let report;
try {
  const { main } = await import(suites[suite]);
  report = { suite, recordedAt: new Date().toISOString(), ...await main() };
  process.exitCode = report.failed ? 1 : 0;
} catch (e) {
  report = { suite, recordedAt: new Date().toISOString(), failed: 1, interrupted: true, error: e.stack ?? String(e) };
  process.exitCode = 2;
} finally {
  writeFileSync(resolve(out, `${suite}.json`), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
