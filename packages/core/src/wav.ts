/**
 * Push-to-talk audio for the voice coach: downsample the microphone to
 * 16 kHz and encode mono 16-bit PCM WAV, the format Muse Voice Transcribe
 * accepts. Pure functions (no DOM) so they are unit tested.
 */
export const COACH_RATE = 16_000;

/** Box-filter downsampling: each output sample averages its input window. */
export function downsample(x: Float32Array, from: number, to: number): Float32Array {
  if (!(from > 0 && to > 0)) throw new Error('sample rates must be positive');
  if (from === to) return x;
  if (to > from) throw new Error('only downsampling is supported');
  const ratio = from / to;
  const out = new Float32Array(Math.floor(x.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(x.length, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = a; j < b; j++) s += x[j];
    out[i] = s / Math.max(1, b - a);
  }
  return out;
}

/** Mono 16-bit PCM WAV with the canonical 44-byte header. Samples are clamped to [-1, 1]. */
export function encodeWav(x: Float32Array, rate: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(44 + x.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + x.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, x.length * 2, true);
  for (let i = 0; i < x.length; i++) {
    const s = Math.max(-1, Math.min(1, x[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}
