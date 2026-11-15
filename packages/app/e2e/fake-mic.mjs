// The IWER emulator has no microphone. This browser-run script plays a real
// recorded WAV (MEBAE_MIC_WAV) as the getUserMedia microphone stream, the way
// Chrome's --use-file-for-fake-audio-capture would. Everything after the mic
// (Web Audio capture, WAV encoding, the coach proxy, Muse) is the real path.
// It also taps the app's audio output (chimes) into a recorder for the film.
import { readFileSync } from 'node:fs';

export default async function run({ page, frame }) {
  const target = frame ?? page;
  const wav = process.env.MEBAE_MIC_WAV;
  if (!wav) throw new Error('MEBAE_MIC_WAV not set');
  const b64 = readFileSync(wav).toString('base64');
  // Headless Chromium needs one user activation before Web Audio may run.
  await page.mouse.click(4, 4);
  return target.evaluate((data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const w = window;
    w.__fakeMic = { plays: 0, wavBytes: bytes.length };
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (!c || !c.audio) throw new DOMException('Only the microphone is emulated', 'NotAllowedError');
      const ctx = new AudioContext();
      if (ctx.state === 'suspended') await ctx.resume();
      const buf = await ctx.decodeAudioData(bytes.slice().buffer);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start(ctx.currentTime + 0.2);
      w.__fakeMic.plays++;
      w.__fakeMic.startedAt = Date.now() + 200;
      w.__fakeMic.seconds = buf.duration;
      return dest.stream;
    };
    return { installed: true, wavBytes: bytes.length };
  }, b64);
}
