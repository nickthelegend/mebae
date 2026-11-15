// Film capture: real hands-only input in the IWER emulator (Quest 3 profile),
// recorded with the CDP screencast at the dev server's 1920x1080 agent viewport
// (no emulator toolbar in agent mode). Each part writes frames + times.txt,
// marks.json (what happened when, for captions) and app-audio.webm (the app's
// own Web Audio output, tapped before it reaches the speakers).
//   MEBAE_FILM_PART=a|b|c|g  MEBAE_FILM_DIR=<new dir>  [MEBAE_MIC_WAV for part a]
// Nothing here changes what the app draws; dev hooks are used only where a
// mark says so (the test clock in part b, labelled in the film).
import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Euler, Quaternion, Vector3 } from '@iwsdk/core';
import { APP } from './lib.mjs';

const exec = promisify(execFile);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const SEAT = { x: -0.08, y: 1.2, z: -1.35 };
const DOOR = [-0.6, 1.2, 1.58];

function quat(pitch, yaw) {
  const q = new Quaternion().setFromEuler(new Euler((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0, 'YXZ'));
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

export default async function run({ page, frame, cdp }) {
  const target = frame ?? page;
  const part = process.env.MEBAE_FILM_PART ?? 'a';
  const dir = process.env.MEBAE_FILM_DIR;
  if (!dir) throw new Error('MEBAE_FILM_DIR not set');
  mkdirSync(dir, { recursive: true });
  const st = () => target.evaluate(() => window.__mebae.state());
  const tg = () => target.evaluate(() => window.__mebae.targets());
  const m = (expr) => target.evaluate((e) => (0, eval)(`(async (m) => (${e}))`)(window.__mebae), expr);
  const xr = async (action, input, timeout = 20_000) => {
    const { stdout } = await exec(`${APP}/node_modules/.bin/iwsdk`, ['xr', action, ...(input ? ['--input-json', JSON.stringify(input)] : [])], { cwd: APP, timeout });
    const r = JSON.parse(stdout);
    if (!r.ok) throw new Error(`${action}: ${JSON.stringify(r.error)}`);
    return r.data?.result ?? r.data;
  };
  const until = async (test, label, ms = 15_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await test()) return;
      await pause(150);
    }
    throw new Error(`film: timed out waiting for ${label}`);
  };
  const aim = async (p, settle = 350) => {
    await xr('look-at', { device: 'hand-right', target: { x: p[0], y: p[1], z: p[2] } });
    await pause(settle);
  };
  const pinch = async (p, hold = 0.15) => {
    await aim(p);
    await xr('select', { device: 'hand-right', duration: hold }, 30_000);
  };
  const head = async (pitch, yaw, seconds = 1.2) => {
    if (seconds <= 0) return xr('set-transform', { device: 'headset', position: SEAT, orientation: { pitch, yaw, roll: 0 } });
    await xr('animate-to', { device: 'headset', position: SEAT, orientation: quat(pitch, yaw), duration: seconds, easing: 'minimum-jerk' }, 30_000);
  };

  // ---- recorder (CDP screencast; real capture timestamps)
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
  const marks = [];
  let t0 = 0;
  const mark = (text, extra = {}) => {
    marks.push({ at: (Date.now() - t0) / 1000, wall: Date.now(), text, ...extra });
    console.error(`[film ${part}] ${((Date.now() - t0) / 1000).toFixed(1)}s ${text}`);
  };

  // The managed workspace draws a small Runtime/Editor switcher over the app
  // (emulator chrome, not Mebae). Hide it for the film; the app is untouched.
  await page.addStyleTag({ content: '.workspace-view-switcher{display:none!important}' }).catch(() => {});

  // ---- app audio tap: every node connected to a context's destination is
  // also connected to a MediaStream recorder (the app's real chimes).
  await page.mouse.click(4, 4); // user activation so headless Web Audio may run
  await target.evaluate(() => {
    const w = window;
    if (w.__tap) return;
    const connect = AudioNode.prototype.connect;
    const tap = { ctxs: [], rec: null, chunks: [], startedAt: 0 };
    w.__tap = tap;
    AudioNode.prototype.connect = function (dest, ...rest) {
      const r = connect.call(this, dest, ...rest);
      if (dest instanceof AudioDestinationNode && !(this.context.__isMic)) {
        const ctx = dest.context;
        if (!ctx.__tapDest) {
          ctx.__tapDest = ctx.createMediaStreamDestination();
          tap.ctxs.push(ctx);
          if (tap.recording) tap.attach(ctx);
        }
        connect.call(this, ctx.__tapDest);
      }
      return r;
    };
    tap.attach = (ctx) => {
      if (tap.rec) return;
      tap.rec = new MediaRecorder(ctx.__tapDest.stream, { mimeType: 'audio/webm;codecs=opus' });
      tap.rec.ondataavailable = (e) => e.data.size && tap.chunks.push(e.data);
      tap.rec.start(250);
      tap.startedAt = Date.now();
    };
  });
  const audioStart = () => target.evaluate(() => {
    const t = window.__tap;
    t.recording = true;
    t.chunks = [];
    t.rec = null;
    if (t.ctxs.length) t.attach(t.ctxs[0]);
  });
  const audioStop = async () => {
    const r = await target.evaluate(async () => {
      const t = window.__tap;
      t.recording = false;
      if (!t.rec) return null;
      await new Promise((res) => { t.rec.onstop = res; t.rec.stop(); });
      const blob = new Blob(t.chunks, { type: 'audio/webm' });
      const b = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      const out = { startedAt: t.startedAt, b64: btoa(s) };
      t.rec = null;
      return out;
    });
    if (r) {
      writeFileSync(join(dir, 'app-audio.webm'), Buffer.from(r.b64, 'base64'));
      return r.startedAt;
    }
    return null;
  };

  let error = null;
  let audioAt = null;
  let audioStopped = false;
  session.on('Page.screencastFrame', onFrame);
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
  t0 = Date.now();
  try {
    if (part === 'a') {
      // first launch -> voice plant -> water check-ins -> icon plant on the door
      mark('first-launch: 2D page');
      await pause(3500);
      await xr('enter');
      await until(async () => (await xr('status')).sessionActive, 'XR');
      await xr('set-input-mode', { mode: 'hand' });
      await head(-28, 0, 0);
      await audioStart();
      await until(async () => (await st()).tray?.placed, 'tray');
      mark('tray placed on the desk');
      await pause(2500);
      let t = await tg();
      // fake mic for the spoken line (see fake-mic.mjs)
      const b64 = readFileSync(process.env.MEBAE_MIC_WAV).toString('base64');
      await target.evaluate((data) => {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        navigator.mediaDevices.getUserMedia = async () => {
          const ctx = new AudioContext();
          ctx.__isMic = true;
          if (ctx.state === 'suspended') await ctx.resume();
          const buf = await ctx.decodeAudioData(bytes.slice().buffer);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const dest = ctx.createMediaStreamDestination();
          src.connect(dest);
          src.start(ctx.currentTime + 0.2);
          window.__fakeMicStartedAt = Date.now() + 200;
          return dest.stream;
        };
      }, b64);
      mark('voice: pinch-hold a seed');
      await aim(t.seed, 500);
      const hold = xr('select', { device: 'hand-right', duration: 4.8 }, 30_000);
      await until(async () => (await st()).coach.state === 'listening', 'listening', 5000);
      mark('voice: listening');
      await hold;
      mark('voice: released, sending', { micAt: await target.evaluate(() => window.__fakeMicStartedAt ?? null) });
      await until(async () => ['heard', 'error'].includes((await st()).coach.state), 'heard', 45_000);
      const s1 = await st();
      if (s1.coach.state !== 'heard') throw new Error(`coach: ${s1.coach.error}`);
      mark('voice: heard', { transcript: s1.coach.last.transcript, habit: s1.coach.last.habit, ms: s1.coach.last.ms });
      await pause(2800);
      const desk = [t.tray[0] + 0.32, t.tray[1] + 0.003, t.tray[2] - 0.15];
      await aim([desk[0] - 0.25, desk[1], desk[2] + 0.05], 500);
      await aim([desk[0] - 0.1, desk[1], desk[2]], 500);
      await aim(desk, 1200);
      mark('voice: aim at the desk (matches "counter")');
      await xr('select', { device: 'hand-right' });
      await until(async () => (await st()).mode === 'idle', 'rooted');
      mark('voice: Water rooted', { lastPlaced: (await st()).lastPlaced });
      await pause(2500);
      // check-ins: +1, +1, +1, then hold to undo one
      const water = (await st()).habits.find((h) => h.label === 'Water');
      for (let i = 0; i < 3; i++) {
        t = await tg();
        await pinch(t.sprouts[water.id].label);
        mark(`check-in water ${i + 1}/8`);
        await pause(1500);
      }
      t = await tg();
      await pinch(t.sprouts[water.id].label, 1.3);
      mark('hold 1 s: undo one (2/8)');
      await pause(2200);
      // icon path: radial -> Stretch -> the door behind the chair
      t = await tg();
      await pinch(t.seed);
      await until(async () => (await st()).mode === 'radial', 'radial');
      mark('icons: the radial');
      t = await tg();
      for (const i of [1, 2, 0]) await aim(t.icons[i], 700);
      await pause(600);
      await pinch(t.icons[0]);
      await until(async () => (await st()).mode === 'aiming', 'aim');
      mark('icons: Stretch, turn to the door');
      await head(-5, 180, 1.8);
      await aim([DOOR[0] + 0.6, DOOR[1] + 0.1, DOOR[2]], 600);
      await aim(DOOR, 1200);
      mark('aim: on the door (scene label)');
      await xr('select', { device: 'hand-right' });
      await until(async () => (await st()).mode === 'idle', 'rooted door');
      mark('Stretch rooted on the door');
      await pause(3000);
      const stretch = (await st()).habits.find((h) => h.label === 'Stretch');
      t = await tg();
      await pinch(t.sprouts[stretch.id].label);
      mark('check-in Stretch: done today');
      await pause(3500);
      await head(-28, 0, 1.6);
      await pause(1200);
    } else if (part === 'b') {
      // growth over days: test clock (dev build only), labelled in the film
      await audioStart();
      await head(-5, 180, 0);
      await pause(1500);
      const stretch = (await st()).habits.find((h) => h.label === 'Stretch');
      mark('door plant, day 1 (stage 2 of 8)', { stage: stretch.stage });
      await pause(1500);
      for (let d = 1; d <= 3; d++) {
        const day = await m('m.advanceDays(1)');
        mark(`test clock: +1 day (${day})`, { testClock: true });
        await pause(1300);
        const t = await tg();
        await pinch(t.sprouts[stretch.id].label);
        const s = await st();
        mark(`check-in day ${d + 1}`, { stage: s.habits.find((h) => h.id === stretch.id).stage, reward: s.reward });
        await pause(3600);
      }
      const day = await m('m.advanceDays(3)');
      mark(`test clock: 3 days skipped (${day})`, { testClock: true });
      await pause(4000);
      const s = await st();
      mark('resting: growth paused, never dies', { vitality: s.habits.find((h) => h.id === stretch.id).vitality });
      await pause(2500);
      const t = await tg();
      await pinch(t.sprouts[stretch.id].label);
      mark('back to it: check-in wakes it');
      await pause(3500);
      await head(-28, 0, 1.6);
      await pause(800);
    } else if (part === 'c') {
      await audioStart();
      await head(-28, 0, 0);
      await pause(1200);
      let t = await tg();
      // focus: rake the sand
      const [a, b] = t.sandSpan;
      await aim(a, 300);
      mark('focus: rake the sand');
      const hand = (await xr('get-device-state')).hands.right.position;
      const dir = { x: b[0] - hand.x, y: b[1] - hand.y, z: b[2] - hand.z };
      const len = Math.hypot(dir.x, dir.y, dir.z);
      const qq = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(dir.x / len, dir.y / len, dir.z / len));
      await xr('set-select-value', { device: 'hand-right', value: 1 });
      await pause(80);
      await xr('animate-to', { device: 'hand-right', orientation: { x: qq.x, y: qq.y, z: qq.z, w: qq.w }, duration: 3.2, easing: 'linear' }, 30_000);
      await xr('set-select-value', { device: 'hand-right', value: 0 });
      mark('focus: 25-minute block running', { focus: (await st()).focus });
      await pause(3000);
      // week rings + weekly note
      t = await tg();
      await pinch(t.menuButtons[1]);
      await until(async () => (await st()).weekOpen, 'week');
      mark('week: rings per habit');
      await pause(2500);
      t = await tg();
      await pinch(t.noteStrip);
      mark('weekly note: asking Muse');
      await until(async () => ['ready', 'error'].includes((await st()).coach.note?.state), 'note', 45_000);
      const note = (await st()).coach.note;
      mark('weekly note: ready', { note });
      await pause(6000);
      t = await tg();
      await pinch(t.week);
      await pause(800);
      // palm up -> wrist menu
      await xr('set-transform', { device: 'hand-left', position: { x: -0.2, y: 1.0, z: -1.65 }, orientation: { fingers: 'forward', palm: 'up' }, anchor: 'wrist' });
      await pause(900);
      mark('palm up: wrist menu');
      await pause(2500);
      t = await tg();
      if (t.wrist) await pinch(t.wrist[5]);
      await xr('set-transform', { device: 'hand-left', position: { x: -0.25, y: 0.85, z: -1.5 }, orientation: { fingers: 'forward', palm: 'down' }, anchor: 'wrist' });
      await pause(1500);
    } else if (part === 'd') {
      await audioStart();
      await head(-28, 0, 0);
      await pause(1000);
      // accessibility
      let t = await tg();
      await pinch(t.menuButtons[3]);
      mark('accessibility: high contrast');
      await pause(2200);
      t = await tg();
      await pinch(t.menuButtons[4]);
      mark('accessibility: larger targets');
      await pause(2200);
      t = await tg();
      await pinch(t.menuButtons[5]);
      mark('accessibility: one-hand mode');
      await pause(2600);
      for (const i of [5, 4, 3]) {
        t = await tg();
        await pinch(t.menuButtons[i]);
        await pause(500);
      }
      // sample garden
      t = await tg();
      await pinch(t.menuButtons[2]);
      mark('example garden (sample data)');
      await pause(2000);
      await head(-18, 25, 1.6);
      await pause(1200);
      await head(-28, -25, 2);
      await pause(1000);
      await head(-28, 0, 1.2);
      t = await tg();
      await pinch(t.menuButtons[2]);
      mark('back to the real garden');
      await pause(1500);
      // persistence (the page reload ends the app-audio tap, so save it first)
      audioAt = await audioStop().catch(() => null);
      audioStopped = true;
      mark('reload: anchors restore');
      await exec(`${APP}/node_modules/.bin/iwsdk`, ['browser', 'reload'], { cwd: APP, timeout: 30_000 }).catch(() => undefined);
      await pause(2500);
      if (!(await xr('status')).sessionActive) await xr('enter');
      await xr('set-input-mode', { mode: 'hand' });
      await head(-28, 0, 0);
      await until(async () => (await st()).tray?.placed && (await st()).sprouts.length >= 2, 'restored', 25_000);
      mark('restored: every sprout back on its spot', { outcomes: (await st()).anchors.outcomes });
      await pause(2000);
      await head(-5, 180, 1.8);
      await pause(2500);
    } else if (part === 'g') {
      // Meta VR Glasses profile: gaze + pinch
      await audioStart();
      await xr('set-input-mode', { mode: 'hand' });
      await xr('set-transform', { device: 'headset', position: SEAT, orientation: { pitch: -30, yaw: 0, roll: 0 } });
      await until(async () => (await st()).tray?.placed, 'tray');
      mark('glasses: gaze + pinch');
      await pause(1500);
      let t = await tg();
      const gaze = async (p) => {
        await xr('look-at', { device: 'gaze', target: { x: p[0], y: p[1], z: p[2] } }).catch(() => xr('look-at', { device: 'headset', target: { x: p[0], y: p[1], z: p[2] } }));
        await pause(500);
        await xr('select', { device: 'hand-right', duration: 0.15 });
      };
      await gaze(t.seed);
      await until(async () => (await st()).mode === 'radial', 'radial');
      await pause(1200);
      t = await tg();
      await gaze(t.icons[2]);
      await until(async () => (await st()).mode === 'aiming', 'aim');
      mark('glasses: Read, look at the spot');
      await pause(800);
      const desk = [t.tray[0] - 0.3, t.tray[1] + 0.003, t.tray[2] - 0.15];
      await gaze(desk);
      await until(async () => (await st()).mode === 'idle', 'rooted');
      mark('glasses: planted by gaze');
      await pause(3000);
    }
  } catch (e) {
    error = e.stack ?? String(e);
    mark(`ERROR ${String(e).slice(0, 200)}`);
  } finally {
    if (!audioStopped) audioAt = await audioStop().catch(() => null);
    await session.send('Page.stopScreencast').catch(() => {});
    session.off?.('Page.screencastFrame', onFrame);
  }
  const report = { part, startedAt: new Date(t0).toISOString(), t0, audioStartedAt: audioAt, frames: n, marks, error, final: await st().catch(() => null) };
  writeFileSync(join(dir, 'marks.json'), JSON.stringify(report, null, 2));
  if (error) throw new Error(error);
  return { part, frames: n, marks: marks.length, audio: !!audioAt };
}
