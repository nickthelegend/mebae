// Small helpers over the IWSDK CLI for the headless e2e runs. Every call goes
// through the real managed browser + IWER; nothing in the app is mocked.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const APP = fileURLToPath(new URL('..', import.meta.url));
const BIN = `${APP}/node_modules/.bin/iwsdk`;

export function cli(args, { timeout = 60_000, allowFail = false } = {}) {
  let out;
  try {
    out = execFileSync(BIN, args, { cwd: APP, encoding: 'utf8', timeout, maxBuffer: 64 << 20 });
  } catch (e) {
    out = e.stdout?.toString() ?? '';
    if (!allowFail) throw new Error(`iwsdk ${args.join(' ')} failed: ${out.slice(0, 800)} ${e.stderr?.toString().slice(0, 400) ?? ''}`);
  }
  let j;
  try {
    j = JSON.parse(out);
  } catch {
    throw new Error(`iwsdk ${args.slice(0, 2).join(' ')} returned non-JSON: ${out.slice(0, 400)}`);
  }
  if (!j.ok && !allowFail) throw new Error(`iwsdk ${args.slice(0, 2).join(' ')}: ${JSON.stringify(j.error).slice(0, 600)}`);
  return j.ok ? (j.data?.result ?? j.data) : j;
}

export const xr = (action, input, opts) => cli(['xr', action, ...(input ? ['--input-json', JSON.stringify(input)] : [])], opts);

export function ev(expr, timeout = 60_000) {
  const out = execFileSync(BIN, ['browser', 'run', 'e2e/eval.mjs', '--timeout', String(timeout)], {
    cwd: APP,
    encoding: 'utf8',
    timeout: timeout + 10_000,
    env: { ...process.env, MEBAE_EVAL: expr },
    maxBuffer: 64 << 20,
  });
  const j = JSON.parse(out);
  if (!j.ok) throw new Error(`eval ${expr}: ${JSON.stringify(j.error).slice(0, 600)}`);
  const d = j.data;
  return d && 'result' in d ? d.result : d;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const v3 = (a) => ({ x: a[0], y: a[1], z: a[2] });
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export async function until(fn, what, ms = 15_000, every = 400) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) {
    last = fn();
    if (last) return last;
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${what}`);
}

const results = [];
export const resetResults = () => { results.length = 0; };
export function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
export function summary() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  return { results, failed: failed.length };
}

/** Browser log entries at level error. `since` is epoch ms: an error from an
 *  earlier command in this long-lived browser is not this suite. An array's
 *  `.entries` is a method, so it must be tested with Array.isArray first. */
export function consoleErrors(logs, since = 0) {
  const entries = Array.isArray(logs)
    ? logs
    : Array.isArray(logs?.logs)
      ? logs.logs
      : Array.isArray(logs?.entries)
        ? logs.entries
        : null;
  if (!entries) throw new Error(`browser logs: unexpected shape ${JSON.stringify(logs).slice(0, 180)}`);
  return entries.filter((l) => l?.level === 'error' && !(since && l.timestamp < since));
}

/** Aim a hand (or gaze) ray at a world point and pinch once. */
export async function pinchAt(device, point, hold = 0.15) {
  xr('look-at', { device, target: v3(point) });
  await sleep(250);
  return xr('select', { device: device === 'gaze' ? 'hand-right' : device, duration: hold }, { timeout: 30_000 });
}
