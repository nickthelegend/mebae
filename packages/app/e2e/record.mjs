// Records the managed browser's app view with CDP screencast for
// MEBAE_REC_SECONDS seconds into MEBAE_REC_DIR as numbered JPEGs plus a
// timestamps file (real capture times; ffmpeg uses them as frame durations).
// Run with the dev server started with --allow-browser-automation.
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ page, cdp }) {
  const dir = process.env.MEBAE_REC_DIR;
  const secs = Number(process.env.MEBAE_REC_SECONDS ?? 30);
  if (!dir) throw new Error('MEBAE_REC_DIR not set');
  mkdirSync(dir, { recursive: true });
  const session = cdp ?? (await page.context().newCDPSession(page));
  let n = 0;
  const times = join(dir, 'times.txt');
  writeFileSync(times, '');
  const onFrame = async (f) => {
    const file = `f${String(n).padStart(5, '0')}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(f.data, 'base64'));
    appendFileSync(times, `${file} ${f.metadata.timestamp}\n`);
    n++;
    try {
      await session.send('Page.screencastFrameAck', { sessionId: f.sessionId });
    } catch {}
  };
  session.on('Page.screencastFrame', onFrame);
  try {
    await session.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 });
    await new Promise((r) => setTimeout(r, secs * 1000));
  } finally {
    await session.send('Page.stopScreencast').catch(() => {});
    session.off?.('Page.screencastFrame', onFrame);
    if (!cdp) await session.detach();
  }
  return { frames: n, dir };
}
