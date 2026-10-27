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
