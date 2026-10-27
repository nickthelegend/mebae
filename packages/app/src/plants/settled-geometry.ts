import {
  BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh,
  Matrix3, Matrix4, Mesh, MeshStandardMaterial, Vector3,
} from '@iwsdk/core';

/** One opaque pass, preserving each part's tint, emission and roughness. */
export const settledMaterial = new MeshStandardMaterial({ vertexColors: true, side: DoubleSide });
settledMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float plantRoughness;
      attribute vec3 plantEmission;
      varying float vPlantRoughness;
      varying vec3 vPlantEmission;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vPlantRoughness = plantRoughness;
      vPlantEmission = plantEmission;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying float vPlantRoughness;
      varying vec3 vPlantEmission;`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPlantRoughness;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vPlantEmission;');
};
settledMaterial.customProgramCacheKey = () => 'mebae-settled-plant-v1';

/** Bake the final instance transforms, without dropping a leaf or a blossom.
 * Growth keeps its instanced animation; this runs once when it finishes.
 */
export function settledGeometry(parts: Mesh[]): BufferGeometry {
  const count = parts.reduce((n, part) => n +
    (part.geometry.index?.count ?? part.geometry.attributes.position.count) *
    (part instanceof InstancedMesh ? part.count : 1), 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const emission = new Float32Array(count * 3);
  const roughness = new Float32Array(count);
  const matrix = new Matrix4(), instance = new Matrix4(), normalMatrix = new Matrix3();
  const position = new Vector3(), normal = new Vector3();
  const tint = new Color(), color = new Color();
  let offset = 0;
  for (const part of parts) {
    part.updateMatrix();
    const geometry = part.geometry;
    const material = part.material as MeshStandardMaterial;
    const instances = part instanceof InstancedMesh ? part.count : 1;
    const vertices = geometry.index?.count ?? geometry.attributes.position.count;
    for (let i = 0; i < instances; i++) {
      matrix.copy(part.matrix);
      tint.copy(material.color);
      if (part instanceof InstancedMesh) {
        part.getMatrixAt(i, instance);
        matrix.multiply(instance);
        if (part.instanceColor) {
          part.getColorAt(i, color);
          tint.multiply(color);
        }
      }
      normalMatrix.getNormalMatrix(matrix);
      for (let j = 0; j < vertices; j++, offset++) {
        const v = geometry.index?.getX(j) ?? j;
        position.fromBufferAttribute(geometry.attributes.position, v).applyMatrix4(matrix);
        normal.fromBufferAttribute(geometry.attributes.normal, v).applyNormalMatrix(normalMatrix);
        position.toArray(positions, offset * 3);
        normal.toArray(normals, offset * 3);
        color.copy(tint);
        if (geometry.attributes.color) {
          color.r *= geometry.attributes.color.getX(v);
          color.g *= geometry.attributes.color.getY(v);
          color.b *= geometry.attributes.color.getZ(v);
        }
        color.toArray(colors, offset * 3);
        material.emissive.toArray(emission, offset * 3);
        emission[offset * 3] *= material.emissiveIntensity;
        emission[offset * 3 + 1] *= material.emissiveIntensity;
        emission[offset * 3 + 2] *= material.emissiveIntensity;
        roughness[offset] = material.roughness;
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('plantRoughness', new BufferAttribute(roughness, 1));
  geometry.setAttribute('plantEmission', new BufferAttribute(emission, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
