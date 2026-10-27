import { activeHabits, growthOf, weekRing, weekStart, addDays } from '@mebae/core';
import { type Entity, Group, Matrix4, Quaternion, Vector3, createSystem } from '@iwsdk/core';
import { makePressable } from '../interaction/press-router.js';
import { garden } from '../state/garden.js';
import { ui } from '../state/ui-state.js';
import { CanvasCard, roundRect } from '../ui/canvas-card.js';
import { drawIcon } from '../ui/icons.js';
import { FONT_MONO, FONT_UI, LOAM, MOSS, SEED_PAPER, TERRACOTTA } from '../ui/palette.js';
import { TraySystem } from './tray.js';

const WRIST_ITEMS = ['Week', 'Sample', 'Contrast', 'Large', 'One-hand', 'Close'] as const;
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
    this.panel = new CanvasCard(1024, 680, 0.46, 0.305, 'Week view');
    this.wrist = new CanvasCard(600, 420, 0.13, 0.091, 'Wrist menu');
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
        this.panel.mesh.position.set(0, 0.2, -0.06);
        this.panel.mesh.visible = false;
        makePressable(this.panelEntity, 'week-panel', { tap: () => (ui.weekOpen.value = false) });
        this.wristEntity = this.world.createTransformEntity(this.wristGroup, { persistent: true });
        this.wristGroup.visible = false;
        makePressable(this.wristEntity, 'wrist-menu', {
          tap: (p) => {
            if (!p || !this.wristGroup.visible) return;
            const l = this.wrist.mesh.worldToLocal(p.clone());
            const col = l.x < 0 ? 0 : 1;
            const top = garden.isSample ? 48 : 0;
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
      const key = `${garden.version.peek()}:${garden.today()}`;
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
      const top = garden.isSample ? 48 : 0;
      if (garden.isSample) {
        g.fillStyle = hc ? '#ffe14d' : SEED_PAPER;
        g.font = `700 27px ${FONT_UI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('EXAMPLE GARDEN (SAMPLE DATA)', w / 2, 27);
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
        g.fillText(t, x + cw / 2, y + ch / 2 + 2);
      });
    });
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
    this.panel.draw((g, w, h) => {
      g.fillStyle = hc ? '#000' : 'rgba(243,236,217,0.97)';
      roundRect(g, 4, 4, w - 8, h - 8, 40);
      g.fill();
      g.lineWidth = hc ? 8 : 3;
      g.strokeStyle = hc ? '#fff' : 'rgba(29,26,20,0.2)';
      g.stroke();
      const ink = hc ? '#fff' : LOAM;
      const accent = hc ? '#ffe14d' : MOSS;
      g.fillStyle = ink;
      g.font = `700 52px ${FONT_UI}`;
      g.textBaseline = 'middle';
      g.textAlign = 'start';
      g.fillText('This week', 44, 62);
      g.font = `500 32px ${FONT_MONO}`;
      g.fillText(`${fmtDay(ws)} – ${fmtDay(we)}`, 330, 64);
      g.textAlign = 'end';
      g.fillText(`stones ${stonesThisWeek}`, w - 44, 64);
      g.textAlign = 'center';
      if (!habits.length) {
        g.font = `500 40px ${FONT_UI}`;
        g.fillText('No habits yet. Pinch a seed in the tray to plant one.', w / 2, h / 2);
      }
      habits.slice(0, 6).forEach((hb, i) => {
        const cx = 175 + (i % 3) * 337;
        const cy = 250 + Math.floor(i / 3) * 255;
        const R = 78;
        const ring = weekRing(l, hb, today);
        ring.forEach((c, d) => {
          const a0 = -Math.PI / 2 + (d / 7) * Math.PI * 2 + 0.06;
          const a1 = -Math.PI / 2 + ((d + 1) / 7) * Math.PI * 2 - 0.06;
          g.lineCap = 'round';
          g.lineWidth = 20;
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
            g.arc(cx + Math.cos(am) * (R + 24), cy + Math.sin(am) * (R + 24), 6, 0, Math.PI * 2);
            g.fill();
          }
        });
        drawIcon(g, hb.glyph, cx, cy, 64, ink, 0.12);
        const gr = growthOf(l, hb, today);
        g.fillStyle = ink;
        g.font = `700 34px ${FONT_UI}`;
        g.fillText(hb.label, cx, cy + R + 50);
        g.font = `500 24px ${FONT_MONO}`;
        g.fillText(gr.inBloom ? 'in bloom' : gr.vitality === 'resting' ? 'resting' : `stage ${gr.stage}`, cx, cy + R + 84);
      });
      if (garden.isSample) {
        g.fillStyle = TERRACOTTA;
        g.font = `700 30px ${FONT_UI}`;
        g.fillText('EXAMPLE GARDEN (SAMPLE DATA)', w / 2, h - 30);
      } else {
        g.fillStyle = hc ? '#fff' : 'rgba(29,26,20,0.55)';
        g.font = `500 24px ${FONT_MONO}`;
        g.fillText('Mon → Sun · a missed day pauses growth, never kills it · pinch to close', w / 2, h - 30);
      }
    });
  }
}
