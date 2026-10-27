import assert from 'node:assert/strict';
import { plantForm, type Species } from '@mebae/core';
import { InstancedMesh, Mesh, ShaderLib } from '@iwsdk/core';
import { PlantMesh } from '../src/plants/plant-mesh.js';
import { settledGeometry, settledMaterial } from '../src/plants/settled-geometry.js';

const species: Species[] = ['moss', 'fern', 'bamboo', 'maple'];
let cases = 0;
for (const kind of species) for (let stage = 0; stage <= 7; stage++) {
  for (const bloom of [false, true]) for (const vitality of ['thriving', 'resting'] as const) {
    const form = plantForm(kind, stage, `regression-${kind}`, bloom);
    const plant = new PlantMesh('Geometry regression');
    plant.set(form, vitality, true);
    // Retain the real animated geometry for comparison immediately before settling.
    const parts = plant.group.children.filter((p): p is Mesh => p instanceof Mesh && !p.name.endsWith(' moss'));
    const triangles = plant.triangles;
    // Write final animation transforms without collapsing the hierarchy yet.
    (plant as unknown as { writeInstances(t: number): void }).writeInstances(1);
    const expected = settledGeometry(parts);
    plant.tick(2);
    assert.equal(plant.triangles, triangles, 'settling retains every triangle');
    const settled = plant.group.children.find((p) => p.name.endsWith(' settled')) as Mesh;
    assert.ok(settled);
    assert.equal(plant.group.children.length, kind === 'moss' ? 2 : 1);
    assert.equal(settled.geometry.groups.length, 0, 'single material draw');
    for (const name of ['position', 'normal', 'color', 'plantEmission', 'plantRoughness']) {
      const data = settled.geometry.getAttribute(name).array;
      assert.deepEqual(data, expected.getAttribute(name).array);
      assert.ok(data.every(Number.isFinite));
    }
    const replay = new PlantMesh('Replay');
    replay.set(form, vitality, false);
    const replayMesh = replay.group.children.find((p) => p.name.endsWith(' settled')) as Mesh;
    assert.deepEqual(replayMesh.geometry.attributes.position.array, settled.geometry.attributes.position.array);
    assert.equal(plant.tick(1), false, 'steady idle has no geometry rebuild');
    assert.equal(plant.group.children.some((p) => p instanceof InstancedMesh), false);
    // Growth after settling rebuilds the original instanced animation.
    plant.set(plantForm(kind, Math.min(7, stage + 1), 'next-stage', bloom), vitality, true);
    assert.ok(plant.group.children.some((p) => p instanceof InstancedMesh));
    plant.dispose();
    replay.dispose();
    expected.dispose();
    assert.equal(plant.group.children.length, 0);
    cases++;
  }
}
const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
settledMaterial.onBeforeCompile(shader as never, null as never);
assert.ok(shader.vertexShader.includes('vPlantEmission = plantEmission;'));
assert.ok(shader.fragmentShader.includes('roughnessFactor = vPlantRoughness;'));
assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance = vPlantEmission;'));
console.log(`plant geometry: ${cases} species/stage/bloom/vitality cases passed; shader injection passed`);

// Geometry-only FoV regression at the audit's recorded seated pose and tray.
// Box3 includes actual settled vertices (and thus all former instance transforms).
import { growthOf, sampleLedger } from '@mebae/core';
import { Box3, Quaternion, Vector3 } from '@iwsdk/core';
import { surfaceQuaternion } from '../src/systems/surface-pose.js';
import { horizontalLabelRise, RADIAL_Y, SAMPLE_PLANT_SCALE, SAMPLE_SPOTS } from '../src/systems/garden-layout.js';

const head = new Vector3(-0.08, 1.2, -1.35);
const tray = new Vector3(-0.08, 0.742, -1.835);
const inverseHead = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 6);
let maxHorizontal = 0, maxVertical = -Infinity, minVertical = Infinity;
function inside(point: Vector3, name: string) {
  const d = point.clone().sub(head).applyQuaternion(inverseHead);
  const h = Math.atan2(d.x, -d.z) * 180 / Math.PI;
  const v = Math.atan2(d.y, -d.z) * 180 / Math.PI;
  maxHorizontal = Math.max(maxHorizontal, Math.abs(h));
  maxVertical = Math.max(maxVertical, v);
  minVertical = Math.min(minVertical, v);
  assert.ok(Math.abs(h) <= 34 && v <= 22 && v >= -40, `${name}: h=${h}, v=${v}`);
}
for (const large of [false, true]) {
  const big = large ? 1.4 : 1;
  const radialScale = large ? 1.2 : 1;
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    inside(tray.clone().add(new Vector3(x * 0.16 * radialScale, RADIAL_Y + y * 0.16 * radialScale, -0.02)), 'radial');
  }
  // The sample history varies its bloom by weekday; check a complete week.
  for (const today of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']) {
    const ledger = sampleLedger(today);
    for (const [i, habit] of ledger.habits.entries()) {
      const growth = growthOf(ledger, habit, today);
      const form = plantForm(habit.species, growth.stage, habit.id, growth.inBloom);
      const plant = new PlantMesh(habit.label);
      plant.set(form, growth.vitality, false);
      plant.group.scale.setScalar(SAMPLE_PLANT_SCALE);
      const root = tray.clone().add(new Vector3(...SAMPLE_SPOTS[i]));
      plant.group.position.copy(root);
      const wall = habit.placement?.surface === 'wall';
      const normal = wall ? head.clone().sub(root).setY(0).normalize() : new Vector3(0, 1, 0);
      surfaceQuaternion(normal, root, head, plant.group.quaternion);
      const box = new Box3().setFromObject(plant.group);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        inside(new Vector3(x, y, z), `${habit.label} plant`);
      }
      const label = root.clone();
      if (wall) label.addScaledVector(normal, 0.06).setY(label.y + 0.13 * big);
      else label.y += horizontalLabelRise(form.height, large, true);
      const yaw = Math.atan2(head.x - root.x, head.z - root.z);
      const facing = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        inside(new Vector3(x * 0.075 * big, y * 0.047 * big, 0).applyQuaternion(facing).add(label), `${habit.label} label`);
      }
      plant.dispose();
    }
  }
}
console.log(`Glasses geometry proxy: h ±${maxHorizontal.toFixed(2)}°, v ${minVertical.toFixed(2)}°…${maxVertical.toFixed(2)}°; normal and Large layouts passed`);
