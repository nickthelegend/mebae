/**
 * Push-to-talk capture: the microphone through Web Audio, downsampled to
 * 16 kHz mono and encoded as 16-bit PCM WAV (what Muse Voice Transcribe
 * accepts). Nothing is stored; the WAV goes to the coach proxy and is dropped.
 */
import { COACH_RATE as RATE, downsample, encodeWav } from '@mebae/core';

export const MAX_SECONDS = 8;

export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private inRate = 48_000;
  private startedAt = 0;
  /** RMS of the last block, 0..1, for the level meter. */
  level = 0;

  get seconds(): number {
    return this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no microphone access (getUserMedia).');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      throw new Error(name === 'NotAllowedError' ? 'Microphone blocked. Allow it for this site, or pinch a seed to pick from the icons.' : `Microphone unavailable: ${(e as Error).message}`);
    }
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = new C();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.inRate = this.ctx.sampleRate;
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.node.onaudioprocess = (ev) => {
      const d = ev.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(d));
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      this.level = Math.min(1, Math.sqrt(sum / d.length) * 6);
    };
    src.connect(this.node);
    // ScriptProcessor only runs when connected; route it through a muted gain.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.node.connect(mute).connect(this.ctx.destination);
    this.startedAt = performance.now();
  }

  /** Stops and returns the WAV, or null if nothing was captured. */
  async stop(): Promise<{ wav: Blob; seconds: number } | null> {
    const chunks = this.chunks;
    const inRate = this.inRate;
    this.release();
    const n = chunks.reduce((a, c) => a + c.length, 0);
    if (!n) return null;
    const pcm = new Float32Array(n);
    let o = 0;
    for (const c of chunks) {
      pcm.set(c, o);
      o += c.length;
    }
    const down = downsample(pcm, inRate, RATE);
    return { wav: new Blob([encodeWav(down, RATE)], { type: 'audio/wav' }), seconds: down.length / RATE };
  }

  cancel(): void {
    this.release();
  }

  private release(): void {
    if (this.node) this.node.onaudioprocess = null;
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close().catch(() => undefined);
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.chunks = [];
    this.startedAt = 0;
    this.level = 0;
  }
}
