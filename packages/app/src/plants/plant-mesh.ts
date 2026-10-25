import type { PlantForm, Species, Vitality } from '@mebae/core';
import { bindInstanceSpherecast } from '../interaction/instance-spherecast.js';
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  ShapeGeometry,
  ShaderMaterial,
  Vector3,
} from '@iwsdk/core';

// ---------------------------------------------------------------- shared

const stemMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
const leafMat = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.6, metalness: 0, emissive: new Color('#132a08'), emissiveIntensity: 0.35 });
const flowerMat = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.5, emissive: new Color('#3a1a0c'), emissiveIntensity: 0.3 });

/** Moss: a noise-edged patch that hugs the surface. One shared material. */
export const mossMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uVital: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uVital;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float r = length(p);
      float edge = 0.62 + 0.38 * fbm(p * 3.1 + 4.0);
      float cover = smoothstep(edge, edge - 0.18, r);
      if (cover < 0.02) discard;
      float grain = fbm(p * 22.0);
      float clump = fbm(p * 7.0 + 11.0);
      vec3 deep = vec3(0.16, 0.27, 0.08);
      vec3 lit = vec3(0.45, 0.62, 0.22);
      vec3 col = mix(deep, lit, grain * 0.8 + clump * 0.4);
      col += vec3(0.06, 0.08, 0.0) * sin(uTime * 0.6 + clump * 6.0) * 0.3;
      col = mix(vec3(dot(col, vec3(0.33))) * vec3(1.05, 1.0, 0.8), col, uVital);
      gl_FragColor = vec4(col, cover * 0.96);
    }`,
});

function leafShape(species: Species): BufferGeometry {
  const s = new Shape();
  if (species === 'maple') {
    // five-lobed palmate leaf, tip at +Y
    const lobes = 5;
    s.moveTo(0, 0);
    for (let i = 0; i <= lobes; i++) {
      const a = Math.PI / 2 + ((i - lobes / 2) / lobes) * Math.PI * 1.25;
      const tip = i % 2 === 0 ? 1 : 0.9;
      const r = i === 0 || i === lobes ? 0.55 : tip;
      const am = a - (Math.PI * 1.25) / lobes / 2;
      if (i > 0) s.lineTo(Math.cos(am) * 0.42, 0.3 + Math.sin(am) * 0.42);
      s.lineTo(Math.cos(a) * r * 0.6, 0.3 + Math.sin(a) * r * 0.7);
    }
    s.lineTo(0, 0);
  } else if (species === 'bamboo') {
    s.moveTo(0, 0);
    s.quadraticCurveTo(0.14, 0.45, 0, 1);
    s.quadraticCurveTo(-0.14, 0.45, 0, 0);
  } else if (species === 'fern') {
    s.moveTo(0, 0);
    s.quadraticCurveTo(0.28, 0.4, 0, 1);
    s.quadraticCurveTo(-0.28, 0.4, 0, 0);
  } else {
    s.moveTo(-0.15, 0);
    s.lineTo(0, 1);
    s.lineTo(0.15, 0);
  }
  return new ShapeGeometry(s, species === 'maple' ? 1 : 4);
}

const leafGeos: Partial<Record<Species, BufferGeometry>> = {};
const leafGeo = (s: Species) => (leafGeos[s] ??= leafShape(s));

const flowerGeo = (() => {
  const s = new Shape();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new ShapeGeometry(s);
})();

const mossGeo = new CircleGeometry(1, 48, 0, Math.PI * 2);
mossGeo.rotateX(-Math.PI / 2);

const LEAF_YOUNG: Record<Species, Color> = {
  maple: new Color('#8fb84a'),
  fern: new Color('#7fae45'),
  bamboo: new Color('#9cc25a'),
  moss: new Color('#88a83c'),
};
const LEAF_OLD: Record<Species, Color> = {
  maple: new Color('#c96a3d'),
  fern: new Color('#3f6b25'),
  bamboo: new Color('#4f7a2c'),
  moss: new Color('#5b7f3a'),
};
const RESTING = new Color('#9a8d5f');

// ---------------------------------------------------------------- builder

const _m = new Matrix4();
const _q = new Quaternion();
const _v = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _c = new Color();

function tubes(form: PlantForm, vital: number): BufferGeometry {
  const SIDES = 6;
  const n = form.stems.length;
  const pos = new Float32Array(n * SIDES * 2 * 3);
  const nor = new Float32Array(n * SIDES * 2 * 3);
  const col = new Float32Array(n * SIDES * 2 * 3);
  const idx: number[] = [];
  const base = form.species === 'bamboo' ? new Color('#a7b85a') : form.species === 'maple' ? new Color('#6b4a2f') : new Color('#557a2c');
  const tip = form.species === 'maple' ? new Color('#8a5d38') : new Color('#7da53e');
  const a = new Vector3();
  const b = new Vector3();
  const d = new Vector3();
  const t1 = new Vector3();
  const t2 = new Vector3();
  form.stems.forEach((seg, i) => {
    a.fromArray(seg.a);
    b.fromArray(seg.b);
    d.subVectors(b, a).normalize();
    t1.set(0, 0, 1);
    if (Math.abs(d.dot(t1)) > 0.9) t1.set(1, 0, 0);
    t2.crossVectors(d, t1).normalize();
    t1.crossVectors(t2, d).normalize();
    for (let r = 0; r < 2; r++) {
      const c = r === 0 ? a : b;
      const rad = r === 0 ? seg.r0 : seg.r1;
      for (let k = 0; k < SIDES; k++) {
        const ang = (k / SIDES) * Math.PI * 2;
        const nx = t1.x * Math.cos(ang) + t2.x * Math.sin(ang);
        const ny = t1.y * Math.cos(ang) + t2.y * Math.sin(ang);
        const nz = t1.z * Math.cos(ang) + t2.z * Math.sin(ang);
        const o = ((i * 2 + r) * SIDES + k) * 3;
        pos[o] = c.x + nx * rad;
        pos[o + 1] = c.y + ny * rad;
        pos[o + 2] = c.z + nz * rad;
        nor[o] = nx;
        nor[o + 1] = ny;
        nor[o + 2] = nz;
        _c.copy(base).lerp(tip, Math.min(1, c.y / Math.max(0.05, form.height)));
        if (vital < 1) _c.lerp(RESTING, (1 - vital) * 0.5);
        col[o] = _c.r;
        col[o + 1] = _c.g;
        col[o + 2] = _c.b;
      }
    }
    const v0 = i * SIDES * 2;
    for (let k = 0; k < SIDES; k++) {
      const k1 = (k + 1) % SIDES;
      idx.push(v0 + k, v0 + SIDES + k, v0 + k1, v0 + k1, v0 + SIDES + k, v0 + SIDES + k1);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/**
 * A living plant: stems (one merged mesh), leaves and flowers (instanced),
 * or a moss patch. Local +Y is the surface normal. `animate()` unfurls the
 * leaves after a check-in; instance matrices are touched only then.
 */
export class PlantMesh {
  readonly group = new Group();
  private leaves: InstancedMesh | null = null;
  private flowers: InstancedMesh | null = null;
  private moss: Mesh | null = null;
  private stems: Mesh | null = null;
  private form: PlantForm | null = null;
  private animT = 1;
  private animating = false;
  private vital = 1;

  constructor(name: string) {
    this.group.name = name;
  }

  get triangles(): number {
    let t = 0;
    if (this.stems) t += (this.stems.geometry.index?.count ?? 0) / 3;
    if (this.leaves) t += this.leaves.count * ((this.leaves.geometry.index?.count ?? 0) / 3);
    if (this.flowers) t += this.flowers.count * ((this.flowers.geometry.index?.count ?? 0) / 3);
    if (this.moss) t += (this.moss.geometry.index?.count ?? 0) / 3;
    return t;
  }

  /** Rebuilds for a new form. `unfurl` plays the growth animation. */
  set(form: PlantForm, vitality: Vitality, unfurl: boolean): void {
    this.dispose();
    this.form = form;
    this.vital = vitality === 'resting' ? 0.35 : 1;
    if (form.stems.length) {
      this.stems = new Mesh(tubes(form, this.vital), stemMat);
      this.stems.name = `${this.group.name} stems`;
      this.group.add(this.stems);
    }
    if (form.mossRadius > 0) {
      this.moss = new Mesh(mossGeo, mossMat);
      this.moss.scale.setScalar(form.mossRadius);
      this.moss.position.y = 0.002;
      this.moss.renderOrder = 2;
      this.moss.name = `${this.group.name} moss`;
      this.group.add(this.moss);
    }
    if (form.leaves.length) {
      this.leaves = new InstancedMesh(leafGeo(form.species), leafMat, form.leaves.length);
      this.leaves.name = `${this.group.name} leaves`;
      bindInstanceSpherecast(this.leaves);
      form.leaves.forEach((l, i) => {
        _c.copy(LEAF_YOUNG[form.species]).lerp(LEAF_OLD[form.species], form.species === 'maple' ? l.age * 0.45 : l.age);
        if (this.vital < 1) _c.lerp(RESTING, 0.45);
        this.leaves!.setColorAt(i, _c);
      });
      this.group.add(this.leaves);
    }
    if (form.flowers.length) {
      this.flowers = new InstancedMesh(flowerGeo, flowerMat, form.flowers.length);
      this.flowers.name = `${this.group.name} bloom`;
      bindInstanceSpherecast(this.flowers);
      form.flowers.forEach((f, i) => this.flowers!.setColorAt(i, _c.set(i % 2 ? '#f3ecd9' : '#e08a5c')));
      this.group.add(this.flowers);
    }
    this.animT = unfurl ? 0 : 1;
    this.animating = unfurl;
    this.writeInstances(this.animT);
  }

  /** Advances the unfurl. Returns true while animating. */
  tick(dt: number): boolean {
    if (!this.animating) return false;
    this.animT = Math.min(1, this.animT + dt / 1.6);
    this.writeInstances(this.animT);
    if (this.animT >= 1) this.animating = false;
    return true;
  }

  private writeInstances(t: number): void {
    const f = this.form;
    if (!f) return;
    const ease = (x: number) => {
      const c = Math.min(1, Math.max(0, x));
      return 1 - Math.pow(1 - c, 3) + Math.sin(c * Math.PI) * 0.12; // slight overshoot
    };
    if (this.leaves) {
      const n = f.leaves.length;
      f.leaves.forEach((l, i) => {
        const delay = (i / Math.max(1, n)) * 0.55;
        const k = ease((t - delay) / 0.45);
        _v.fromArray(l.dir);
        _q.setFromUnitVectors(_up, _v);
        // unfurl: leaves start curled (rotated back) and open
        const curl = (1 - Math.min(1, Math.max(0, (t - delay) / 0.45))) * 1.4;
        if (curl > 0) _q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -curl));
        _s.setScalar(Math.max(0.0001, l.size * k));
        _m.compose(new Vector3().fromArray(l.pos), _q, _s);
        this.leaves!.setMatrixAt(i, _m);
      });
      this.leaves.instanceMatrix.needsUpdate = true;
      if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
      this.leaves.computeBoundingSphere();
    }
    if (this.flowers) {
      const k = ease((t - 0.6) / 0.4);
      f.flowers.forEach((fl, i) => {
        _q.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2.4);
        _s.setScalar(Math.max(0.0001, fl.size * k));
        _m.compose(new Vector3().fromArray(fl.pos), _q, _s);
        this.flowers!.setMatrixAt(i, _m);
      });
      this.flowers.instanceMatrix.needsUpdate = true;
      this.flowers.computeBoundingSphere();
    }
    if (this.stems) this.stems.scale.setScalar(0.6 + 0.4 * ease(t / 0.5));
    if (this.moss) this.moss.scale.setScalar((f.mossRadius || 0.01) * (0.7 + 0.3 * ease(t)));
  }

  dispose(): void {
    if (this.stems) {
      this.stems.geometry.dispose();
      this.group.remove(this.stems);
    }
    for (const m of [this.leaves, this.flowers]) if (m) {
      m.dispose();
      this.group.remove(m);
    }
    if (this.moss) this.group.remove(this.moss);
    this.stems = this.leaves = this.flowers = null;
    this.moss = null;
  }
}
