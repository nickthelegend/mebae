import { describe, expect, it } from 'vitest';
import { COACH_RATE, downsample, encodeWav } from '../src/index.js';

describe('voice coach audio', () => {
  it('downsamples 48 kHz to 16 kHz by averaging windows', () => {
    const x = new Float32Array([0, 0.3, 0.6, 1, 1, 1, -1, -1, -1]);
    const y = downsample(x, 48_000, 16_000);
    expect(Array.from(y).map((v) => +v.toFixed(3))).toEqual([0.3, 1, -1]);
  });
  it('keeps the duration', () => {
    const x = new Float32Array(48_000 * 2);
    expect(downsample(x, 48_000, COACH_RATE).length).toBe(32_000);
    expect(downsample(new Float32Array(44_100), 44_100, COACH_RATE).length).toBe(16_000);
  });
  it('passes through at the same rate and refuses upsampling', () => {
    const x = new Float32Array([0.1, 0.2]);
    expect(downsample(x, 16_000, 16_000)).toBe(x);
    expect(() => downsample(x, 8_000, 16_000)).toThrow(/downsampling/);
  });
  it('writes a mono 16-bit 16 kHz WAV header and clamped samples', () => {
    const w = encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]), COACH_RATE);
    const v = new DataView(w.buffer);
    const ascii = (o: number) => String.fromCharCode(...w.subarray(o, o + 4));
    expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(12);
    expect(w.length).toBe(44 + 12);
    expect([1, 2, 3, 4, 5, 6].map((i) => v.getInt16(42 + i * 2, true))).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });
});
