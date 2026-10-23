/**
 * Synthesised chimes (WebAudio, no sound files). Soft bell partials on a
 * pentatonic scale. The context is created on the first pinch.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  if (ctx) return ctx;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  ctx = new C();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume();
}

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

function bell(freq: number, when: number, gain: number, decay: number): void {
  const c = ac();
  if (!c || !master) return;
  for (const [ratio, g] of [
    [1, 1],
    [2.76, 0.32],
    [5.4, 0.12],
  ] as const) {
    const o = c.createOscillator();
    const e = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq * ratio;
    e.gain.setValueAtTime(0, when);
    e.gain.linearRampToValueAtTime(gain * g, when + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, when + decay / ratio);
    o.connect(e).connect(master);
    o.start(when);
    o.stop(when + decay + 0.05);
  }
}

const note = (semi: number) => 523.25 * Math.pow(2, semi / 12);

/** Small tick: a pinch registered. `step` walks up the scale for counted habits. */
export function chimeTap(step = 0): void {
  const c = ac();
  if (!c) return;
  bell(note(PENTA[step % PENTA.length]), c.currentTime, 0.18, 0.9);
}

/** Growth: a rising three-note arpeggio. */
export function chimeGrow(): void {
  const c = ac();
  if (!c) return;
  [0, 4, 7].forEach((s, i) => bell(note(PENTA[s] - 12), c.currentTime + i * 0.11, 0.22, 1.8));
}

/** Rooting a new seed: low and warm. */
export function chimeRoot(): void {
  const c = ac();
  if (!c) return;
  bell(note(-12), c.currentTime, 0.25, 2.2);
  bell(note(-5), c.currentTime + 0.09, 0.15, 1.6);
}

export function chimeUndo(): void {
  const c = ac();
  if (!c) return;
  bell(note(4), c.currentTime, 0.12, 0.5);
  bell(note(0), c.currentTime + 0.08, 0.12, 0.6);
}
