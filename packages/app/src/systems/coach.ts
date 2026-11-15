import { presetById, surfaceHint } from '@mebae/core';
import { type Entity, createSystem } from '@iwsdk/core';
import { type HeardHabit, coachConfigured, describeCoachError, habitFromVoice } from '../coach/client.js';
import { MAX_SECONDS, MicCapture } from '../coach/mic.js';
import { chimeListen, chimeTap, chimeUndo, unlockAudio, voiceLine } from '../fx/chimes.js';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { cardFor, roundRect, wrapLines } from '../ui/canvas-card.js';
import { drawIcon } from '../ui/icons.js';
import { FONT_MONO, FONT_UI, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';
import { PlantingSystem } from './planting.js';
import { TrayEvents, TraySystem } from './tray.js';

const BARS = 28;

/**
 * Voice-first planting. Pinch-hold a seed (or pinch "Speak") and say the
 * habit: "drink water by the counter, eight a day". The WAV goes to the coach
 * proxy (Muse Voice Transcribe → Muse Spark), which answers with a preset,
 * a daily count and a place; the seed then lifts and you point at the spot,
 * exactly like the icon path. Without the proxy the card says so plainly and
 * the icon radial is unchanged.
 */
export class VoiceCoachSystem extends createSystem({}) {
  private card = cardFor('coach', 'Voice coach');
  private entity: Entity | null = null;
  private mic = new MicCapture();
  private via: 'hold' | 'toggle' = 'hold';
  private levels: number[] = new Array(BARS).fill(0);
  private lastDraw = 0;
  private hideAt = 0;
  private placedRef: unknown = null;
  /** For the e2e suite and the film: what was heard and how long it took. */
  last: (HeardHabit & { at: number }) | null = null;
  error: string | null = null;
  recordedSeconds = 0;

  init(): void {
    this.card.mesh.visible = false;
    this.card.mesh.renderOrder = 15;
    const ev = this.world.getSystem(TrayEvents)!;
    this.cleanupFuncs.push(
      ev.on('voice-hold', () => void this.listen('hold')),
      ev.on('voice-release', () => {
        if (ui.coach.peek() === 'listening' && this.via === 'hold') void this.send();
      }),
      ev.on('voice-toggle', () => {
        if (ui.coach.peek() === 'listening') void this.send();
        else void this.listen('toggle');
      }),
      ui.coach.subscribe(() => garden.bump()),
    );
    this.xrManager.addEventListener('sessionend', () => {
      this.mic.cancel();
      ui.coach.value = 'idle';
    });
  }

  private wire(): boolean {
    if (this.entity) return true;
    const tray = this.world.getSystem(TraySystem);
    if (!tray?.entity) return false;
    this.entity = this.world.createTransformEntity(this.card.mesh, { parent: tray.entity, persistent: true });
    this.card.mesh.position.set(0, 0.17, -0.06);
    this.card.mesh.rotation.x = -0.12;
    return true;
  }

  private async listen(via: 'hold' | 'toggle'): Promise<void> {
    unlockAudio();
    if (!this.wire()) return;
    const st = ui.coach.peek();
    if (st === 'listening' || st === 'thinking') return;
    if (ui.mode.peek() !== 'idle') return garden.say('Finish this seed first, then hold a seed to speak a new habit.');
    if (garden.isSample) return garden.say('Turn off the example garden to plant your own habits.');
    if (!this.world.getSystem(TraySystem)!.freeSlots().length)
      return garden.say('All 6 habits are planted. Move a sprout into the tray to free a seed.');
    ui.weekOpen.value = false;
    if (!coachConfigured()) return this.fail(describeCoachError(null));
    this.via = via;
    this.error = null;
    this.levels.fill(0);
    ui.coach.value = 'listening';
    this.show();
    chimeListen(); // a chime, not a voice prompt: the mic is already open
    try {
      await this.mic.start();
    } catch (e) {
      return this.fail(`AI unavailable: ${(e as Error).message}`);
    }
    // the hold may have ended while the permission prompt was up
    if (ui.coach.peek() !== 'listening') this.mic.cancel();
  }

  private async send(): Promise<void> {
    if (ui.coach.peek() !== 'listening') return;
    ui.coach.value = 'thinking';
    this.show();
    const rec = await this.mic.stop();
    this.recordedSeconds = rec?.seconds ?? 0;
    if (!rec || rec.seconds < 0.5) return this.fail('Too short. Hold the seed, wait for the chime, then say the habit.');
    chimeTap(1);
    let heard: HeardHabit;
    try {
      heard = await habitFromVoice(rec.wav);
    } catch (e) {
      return this.fail(describeCoachError(e));
    }
    this.last = { ...heard, at: performance.now() };
    const h = heard.habit;
    const planting = this.world.getSystem(PlantingSystem)!;
    this.placedRef = planting.lastPlaced;
    if (!planting.beginFromCoach(h.preset, h.target, h.surface, heard.transcript)) {
      return this.fail('Heard you, but a seed is busy. Try again in a moment.');
    }
    ui.coach.value = 'heard';
    this.hideAt = 0;
    voiceLine('heard');
    this.show();
  }

  private fail(msg: string): void {
    this.mic.cancel();
    this.error = msg;
    ui.coach.value = 'error';
    this.hideAt = performance.now() + 8000;
    chimeUndo();
    voiceLine('unavailable');
    this.show();
  }

  private show(): void {
    if (!this.wire()) return;
    this.card.mesh.visible = true;
    this.draw();
  }

  update(): void {
    const st = ui.coach.peek();
    if (st === 'idle') {
      if (this.card.mesh.visible) this.card.mesh.visible = false;
      return;
    }
    const now = performance.now();
    if (st === 'listening') {
      if (this.mic.seconds >= MAX_SECONDS) void this.send();
      if (now - this.lastDraw > 90) {
        this.levels.shift();
        this.levels.push(this.mic.level);
        this.draw();
      }
    }
    if (st === 'heard') {
      const planting = this.world.getSystem(PlantingSystem)!;
      // rooted (new lastPlaced) or the seed went back: linger, then hide
      if (!this.hideAt && ui.mode.peek() === 'idle') {
        const planted = planting.lastPlaced !== this.placedRef;
        if (planted) voiceLine('planted');
        this.hideAt = now + (planted ? 5000 : 1500);
        this.draw();
      }
    }
    if (this.hideAt && now > this.hideAt) {
      this.hideAt = 0;
      ui.coach.value = 'idle';
    }
  }

  private draw(): void {
    this.lastDraw = performance.now();
    const st = ui.coach.peek();
    const hc = garden.settings.highContrast;
    const planting = this.world.getSystem(PlantingSystem);
    this.card.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : st === 'error' ? '#3a1d12' : 'rgba(29,26,20,0.93)';
      roundRect(g, 4, 4, w - 8, h - 8, 44);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = hc ? '#ffe14d' : st === 'error' ? TERRACOTTA : st === 'listening' ? '#a6e05c' : 'rgba(243,236,217,0.3)';
      g.stroke();
      g.textBaseline = 'middle';
      g.textAlign = 'start';
      const paper = hc ? '#fff' : SEED_PAPER;
      const tag = (t: string, color: string) => {
        g.font = `700 40px ${FONT_UI}`;
        g.fillStyle = color;
        g.fillText(t, 48, 56, w - 96);
      };
      if (st === 'listening') {
        tag(`● Listening · ${this.mic.seconds.toFixed(1)} s`, hc ? '#ffe14d' : '#a6e05c');
        g.fillStyle = paper;
        g.font = `700 54px ${FONT_UI}`;
        g.fillText('Say your habit and where it happens', 48, 124, w - 96);
        // level meter
        const bw = (w - 96) / BARS;
        this.levels.forEach((lv, i) => {
          const bh = 10 + lv * 90;
          g.fillStyle = hc ? '#ffe14d' : i > BARS - 4 ? '#a6e05c' : 'rgba(166,224,92,0.75)';
          roundRect(g, 48 + i * bw + 3, 222 - bh / 2, bw - 6, bh, 5);
          g.fill();
        });
        g.fillStyle = hc ? '#fff' : 'rgba(243,236,217,0.8)';
        g.font = `500 40px ${FONT_MONO}`;
        g.fillText(this.via === 'hold' ? 'release the seed to send' : 'pinch Speak again to send', 48, 294, w - 96);
      } else if (st === 'thinking') {
        tag('Muse is listening back…', hc ? '#ffe14d' : '#ffd27a');
        g.fillStyle = paper;
        g.font = `700 54px ${FONT_UI}`;
        g.fillText('Voice → text → your habit', 48, 140, w - 96);
        g.font = `500 40px ${FONT_MONO}`;
        g.fillStyle = hc ? '#fff' : 'rgba(243,236,217,0.8)';
        g.fillText(`${this.recordedSeconds.toFixed(1)} s of audio · muse-voice + muse-spark`, 48, 230, w - 96);
      } else if (st === 'heard' && this.last) {
        const hb = this.last.habit;
        const preset = presetById(hb.preset)!;
        const placed = planting?.lastPlaced && planting.lastPlaced !== this.placedRef ? planting.lastPlaced : null;
        tag(`${placed ? `Planted ✓ on: ${placed.label}` : 'Heard you'} · ${(this.last.ms / 1000).toFixed(1)} s`, hc ? '#ffe14d' : '#a6e05c');
        g.fillStyle = hc ? '#fff' : 'rgba(243,236,217,0.85)';
        g.font = `italic 500 40px ${FONT_UI}`;
        wrapLines(g, `“${this.last.transcript}”`, w - 96, 1).forEach((l) => g.fillText(l, 48, 112));
        g.fillStyle = hc ? '#ffe14d' : MOSS;
        g.beginPath();
        g.arc(100, 214, 52, 0, Math.PI * 2);
        g.fill();
        drawIcon(g, preset.glyph, 100, 214, 64, hc ? '#000' : SEED_PAPER, 0.14);
        g.fillStyle = paper;
        g.font = `700 56px ${FONT_UI}`;
        g.fillText(`${preset.label}${hb.target > 1 ? ` · ${hb.target} a day` : ' · daily'}`, 176, 196, w - 220);
        g.font = `500 40px ${FONT_UI}`;
        g.fillStyle = hc ? '#fff' : 'rgba(243,236,217,0.85)';
        g.fillText(placed ? `Pinch it there each time you do it.` : `Point at ${surfaceHint(hb.surface)} and pinch`, 176, 262, w - 220);
      } else {
        tag('AI unavailable', hc ? '#ffe14d' : TERRACOTTA);
        g.fillStyle = paper;
        g.font = `600 44px ${FONT_UI}`;
        const msg = (this.error ?? 'Unknown error').replace(/^AI unavailable:\s*/, '');
        wrapLines(g, msg, w - 96, 4).forEach((l, i) => g.fillText(l, 48, 118 + i * 54));
      }
    });
  }
}
