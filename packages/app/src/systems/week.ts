import { activeHabits, addDays, dayKey, growthOf, stageName, weekRing, weekStart, weeklySummary } from '@mebae/core';
import { type Entity, Group, Matrix4, Quaternion, Vector3, createSystem } from '@iwsdk/core';
import { makePressable } from '../interaction/press-router.js';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { CanvasCard, cardFor, roundRect, wrapLines } from '../ui/canvas-card.js';
import { coachConfigured, describeCoachError, weeklyNote } from '../coach/client.js';
import { chimeTap, unlockAudio } from '../fx/chimes.js';
import { drawIcon } from '../ui/icons.js';
import { FONT_MONO, FONT_UI, LOAM, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';
import { TraySystem } from './tray.js';

const WRIST_ITEMS = ['Week', 'Sample', 'Contrast', 'Large', 'One-hand', 'Close'] as const;
/** Canvas x (px) where the coach-note column starts on the week panel. */
const NOTE_LEFT = 880;
const WRIST_TOP = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Review: turn the left palm up for the wrist menu, pinch "Week" to see a
 * ring per habit (7 segments, Mon-Sun). The tray menu has the same button,
 * so one-hand users never need the palm gesture.
 */
export class WeekSystem extends createSystem({}) {
  private panel!: CanvasCard;
  private panelEntity: Entity | null = null;
  private wrist!: CanvasCard;
  private wristGroup = new Group();
  private wristEntity: Entity | null = null;
  private palmUpSince = 0;
  private palmDownSince = 0;
  private wristClosed = false;
  palmUp = false;
  private lastKey = '';
  /** Weekly note from the coach (memory only, never saved). */
  note: { state: 'idle' | 'asking' | 'ready' | 'error'; text: string; spoken: string; at: number; ms?: number } = { state: 'idle', text: '', spoken: '', at: 0 };
  private wristVer = -1;
  private m = new Matrix4();
  private wristPos = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private n = new Vector3();
  private head = new Vector3();
  private s = new Vector3();
  private q = new Quaternion();

  init(): void {
    this.panel = cardFor('week', 'Week view');
    this.wrist = cardFor('wrist', 'Wrist menu');
    this.wristGroup.name = 'Wrist menu';
    this.wristGroup.add(this.wrist.mesh);
    const start = () => {
      const wire = () => {
        const tray = this.world.getSystem(TraySystem);
        if (this.panelEntity) return;
        if (!tray?.entity) return void setTimeout(wire, 50);
        this.panelEntity = this.world.createTransformEntity(this.panel.mesh, { parent: tray.entity, persistent: true });
        // Just above the tray. At 0.36 the top corners sit ~36° above a seated
        // view aimed at the desk, outside the Glasses' 25° upward field.
        // Wide rather than tall: the top edge stays inside the Glasses' 25° upward field.
        this.panel.mesh.position.set(0, 0.19, -0.07);
        this.panel.mesh.rotation.x = -0.18;
        this.panel.mesh.visible = false;
        makePressable(this.panelEntity, 'week-panel', {
          tap: (p) => {
            // The right-hand column asks the coach for this week's note; anywhere else closes.
            if (p) {
              const l = this.panel.mesh.worldToLocal(p.clone());
              const x = ((l.x + this.panel.mW / 2) / this.panel.mW) * this.panel.pxW;
              if (x >= NOTE_LEFT) return void this.askNote();
            }
            ui.weekOpen.value = false;
          },
        });
        this.wristEntity = this.world.createTransformEntity(this.wristGroup, { persistent: true });
        this.wristGroup.visible = false;
        makePressable(this.wristEntity, 'wrist-menu', {
          tap: (p) => {
            if (!p || !this.wristGroup.visible) return;
            const l = this.wrist.mesh.worldToLocal(p.clone());
            const col = l.x < 0 ? 0 : 1;
            const top = garden.isSample ? WRIST_TOP : 0;
            const y = ((this.wrist.mH / 2 - l.y) / this.wrist.mH) * this.wrist.pxH;
            if (y < top) return;
            const row = Math.max(0, Math.min(2, Math.floor(((y - top) / (this.wrist.pxH - top)) * 3)));
            const item = WRIST_ITEMS[row * 2 + col];
            if (item === 'Close') {
              this.wristClosed = true;
              this.wristGroup.visible = false;
            }
            else this.world.getSystem(TraySystem)!.menuAction(item);
          },
        });
        this.drawWrist();
      };
      wire();
    };
    this.xrManager.addEventListener('sessionstart', start);
    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', start),
      ui.weekOpen.subscribe(() => {
        this.lastKey = '';
        garden.bump();
      }),
    );
  }

  update(): void {
    const tray = this.world.getSystem(TraySystem);
    if (!tray?.placed || !this.panelEntity) return;
    this.updatePalm();
    this.wrist.mesh.scale.setScalar(garden.settings.largeTargets ? 1.4 : 1);
    const ver = garden.version.peek();
    if (this.wristGroup.visible && ver !== this.wristVer) {
      this.wristVer = ver;
      this.drawWrist();
    }
    const open = ui.weekOpen.peek();
    this.panel.mesh.visible = open;
    if (open) {
      const key = `${garden.version.peek()}:${garden.today()}:${this.note.state}:${this.note.at}`;
      if (key !== this.lastKey) {
        this.lastKey = key;
        this.drawWeek();
      }
    }
  }

  private updatePalm(): void {
    const s = this.xrManager.getSession();
    const frame = this.xrFrame;
    const ref = this.xrManager.getReferenceSpace();
    if (!s || !frame || !ref || !frame.getJointPose) return;
    let up = false;
    for (const src of s.inputSources) {
      if (src.handedness !== 'left' || !src.hand) continue;
      const w = frame.getJointPose(src.hand.get('wrist')!, ref);
      const i = frame.getJointPose(src.hand.get('index-finger-metacarpal')!, ref);
      const p = frame.getJointPose(src.hand.get('pinky-finger-metacarpal')!, ref);
      if (!w || !i || !p) continue;
      this.wristPos.set(w.transform.position.x, w.transform.position.y, w.transform.position.z);
      this.a.set(i.transform.position.x, i.transform.position.y, i.transform.position.z).sub(this.wristPos);
      this.b.set(p.transform.position.x, p.transform.position.y, p.transform.position.z).sub(this.wristPos);
      // left hand: pinky x index points out of the palm
      this.n.crossVectors(this.b, this.a).normalize();
      up = this.n.y > 0.65;
      if (up) {
        // menu floats 9 cm above the palm centre, facing the eyes
        this.s.copy(this.a).add(this.b).multiplyScalar(0.5).add(this.wristPos);
        this.wristGroup.position.copy(this.s).addScaledVector(this.n, 0.09);
        this.player.head.getWorldPosition(this.head);
        this.m.lookAt(this.head, this.wristGroup.position, this.n.set(0, 1, 0));
        this.q.setFromRotationMatrix(this.m);
        this.wristGroup.quaternion.copy(this.q);
      }
    }
    const now = performance.now();
    if (up) {
      this.palmDownSince = 0;
      if (!this.palmUpSince) this.palmUpSince = now;
      if (now - this.palmUpSince > 250 && !this.wristClosed && !this.wristGroup.visible) {
        this.drawWrist();
        this.wristGroup.visible = true;
      }
    } else {
      this.palmUpSince = 0;
      if (!this.palmDownSince) this.palmDownSince = now;
      if (now - this.palmDownSince > 400) {
        this.wristGroup.visible = false;
        this.wristClosed = false;
      }
    }
    this.palmUp = up;
  }

  private drawWrist(): void {
    const st = garden.settings;
    const hc = st.highContrast;
    const on = [ui.weekOpen.peek(), garden.isSample, st.highContrast, st.largeTargets, st.oneHand, false];
    this.wrist.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : 'rgba(29,26,20,0.9)';
      roundRect(g, 2, 2, w - 4, h - 4, 40);
      g.fill();
      const top = garden.isSample ? WRIST_TOP : 0;
      if (garden.isSample) {
        g.fillStyle = hc ? '#ffe14d' : SEED_PAPER;
        g.font = `700 40px ${FONT_UI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('SAMPLE DATA', w / 2, 34, w - 40);
      }
      const cw = w / 2, ch = (h - top) / 3;
      WRIST_ITEMS.forEach((t, k) => {
        const x = (k % 2) * cw, y = top + Math.floor(k / 2) * ch;
        g.fillStyle = on[k] ? (hc ? '#ffe14d' : MOSS) : hc ? '#222' : 'rgba(243,236,217,0.12)';
        roundRect(g, x + 12, y + 12, cw - 24, ch - 24, 26);
        g.fill();
        g.fillStyle = on[k] ? (hc ? '#000' : SEED_PAPER) : hc ? '#fff' : SEED_PAPER;
        g.font = `700 44px ${FONT_UI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(t, x + cw / 2, y + ch / 2 + 2, cw - 36);
      });
    });
  }

  /** Asks the coach for a short note about this week's real history. */
  private async askNote(): Promise<void> {
    unlockAudio();
    if (this.note.state === 'asking') return;
    if (garden.isSample) {
      this.note = { state: 'error', text: 'The example garden is sample data. Turn it off to get a note about your own week.', spoken: '', at: performance.now() };
      return;
    }
    if (!coachConfigured()) {
      this.note = { state: 'error', text: describeCoachError(null), spoken: '', at: performance.now() };
      return;
    }
    chimeTap(3);
    this.note = { state: 'asking', text: 'Muse is reading your week…', spoken: '', at: performance.now() };
    try {
      const summary = weeklySummary(garden.real, garden.today(), (ms) => dayKey(ms));
      if (!summary.habits.length) throw new Error('Plant a habit first: the note is about your own history.');
      const r = await weeklyNote(summary);
      // Muse's note is dynamic text: shown as a caption on the panel, never voiced
      // (Mebae's only voice is pre-rendered Chatterbox audio for fixed lines).
      this.note = { state: 'ready', text: r.note, spoken: '', at: performance.now(), ms: r.ms };
    } catch (e) {
      this.note = { state: 'error', text: describeCoachError(e), spoken: '', at: performance.now() };
    }
  }

  private drawWeek(): void {
    const l = garden.ledger;
    const today = garden.today();
    const habits = activeHabits(l);
    const ws = weekStart(today);
    const we = addDays(ws, 6);
    const hc = garden.settings.highContrast;
    const fmtDay = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8))}`;
    const stonesThisWeek = l.focus.blocks.filter((b) => {
      const d = new Date(b.completedAt);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return k >= ws && k <= we;
    }).length;
    const note = this.note;
    this.panel.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : 'rgba(243,236,217,0.97)';
      roundRect(g, 4, 4, w - 8, h - 8, 44);
      g.fill();
      g.lineWidth = hc ? 8 : 4;
      g.strokeStyle = hc ? '#fff' : 'rgba(29,26,20,0.2)';
      g.stroke();
      const ink = hc ? '#fff' : LOAM;
      const accent = hc ? '#ffe14d' : MOSS;
      // All text ≥ 34 px: 18 mm cap height at 1 m (CARDS.week in @mebae/core).
      g.fillStyle = ink;
      g.font = `700 60px ${FONT_UI}`;
      g.textBaseline = 'middle';
      g.textAlign = 'start';
      g.fillText('This week', 44, 62);
      g.font = `600 36px ${FONT_MONO}`;
      g.fillText(`${fmtDay(ws)} – ${fmtDay(we)}`, 330, 66);
      g.textAlign = 'center';
      if (!habits.length) {
        g.font = `600 40px ${FONT_UI}`;
        wrapLines(g, 'No habits yet. Pinch a seed in the tray to plant one.', NOTE_LEFT - 120, 2).forEach((line, i) => g.fillText(line, NOTE_LEFT / 2, 320 + i * 52));
      }
      habits.slice(0, 6).forEach((hb, i) => {
        const cx = 155 + (i % 3) * 290;
        const cy = 200 + Math.floor(i / 3) * 252;
        const R = 58;
        const ring = weekRing(l, hb, today);
        ring.forEach((c, d) => {
          const a0 = -Math.PI / 2 + (d / 7) * Math.PI * 2 + 0.07;
          const a1 = -Math.PI / 2 + ((d + 1) / 7) * Math.PI * 2 - 0.07;
          g.lineCap = 'round';
          g.lineWidth = 18;
          g.strokeStyle = hc ? '#444' : 'rgba(29,26,20,0.12)';
          g.beginPath();
          g.arc(cx, cy, R, a0, a1);
          g.stroke();
          if (c.fraction > 0) {
            g.strokeStyle = c.fraction >= 1 ? accent : hc ? '#bbb' : TERRACOTTA;
            g.beginPath();
            g.arc(cx, cy, R, a0, a0 + (a1 - a0) * c.fraction);
            g.stroke();
          }
          if (c.day === today) {
            g.fillStyle = ink;
            const am = (a0 + a1) / 2;
            g.beginPath();
            g.arc(cx + Math.cos(am) * (R + 20), cy + Math.sin(am) * (R + 20), 7, 0, Math.PI * 2);
            g.fill();
          }
        });
        drawIcon(g, hb.glyph, cx, cy, 50, ink, 0.12);
        const gr = growthOf(l, hb, today);
        g.fillStyle = ink;
        g.font = `700 40px ${FONT_UI}`;
        g.fillText(hb.label, cx, cy + R + 44, 270);
        g.font = `600 34px ${FONT_MONO}`;
        g.fillText(gr.inBloom ? 'in bloom' : gr.vitality === 'resting' ? 'resting' : `${stageName(gr.stage).toLowerCase()} ${gr.stage + 1}/8`, cx, cy + R + 84, 270);
      });
      // coach note column
      const x0 = NOTE_LEFT;
      g.fillStyle = hc ? '#111' : note.state === 'error' ? 'rgba(201,106,61,0.16)' : 'rgba(91,127,58,0.14)';
      roundRect(g, x0, 24, w - x0 - 24, h - 48, 30);
      g.fill();
      g.textAlign = 'start';
      g.fillStyle = hc ? '#ffe14d' : note.state === 'error' ? TERRACOTTA : MOSS;
      g.font = `700 38px ${FONT_UI}`;
      const head =
        garden.isSample ? 'SAMPLE DATA'
        : note.state === 'asking' ? 'Asking Muse…'
        : note.state === 'error' ? 'Note unavailable'
        : 'Weekly note · AI';
      g.fillText(head, x0 + 28, 74, w - x0 - 80);
      g.fillStyle = ink;
      g.font = `500 34px ${FONT_UI}`;
      const body =
        garden.isSample
          ? 'The example garden is sample data. Turn it off for a note about your own week.'
          : note.state === 'idle'
            ? coachConfigured()
              ? 'Pinch here for a short note from Muse about your real week. Only counts are sent, never places.'
              : 'Setup required: this build has no coach proxy. Everything else works without it.'
            : note.text;
      wrapLines(g, body, w - x0 - 64, 13).forEach((line, i) => g.fillText(line, x0 + 28, 128 + i * 40));
      if (!garden.isSample) {
        g.fillStyle = hc ? '#fff' : 'rgba(29,26,20,0.6)';
        g.font = `500 34px ${FONT_MONO}`;
        g.textAlign = 'center';
        g.fillText(`${stonesThisWeek} focus stone${stonesThisWeek === 1 ? '' : 's'} · pinch here to close`, NOTE_LEFT / 2, h - 44, NOTE_LEFT - 60);
      }
    });
  }
}
