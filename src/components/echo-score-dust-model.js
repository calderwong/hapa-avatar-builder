// Avatar 3D models as Score Dust shapes (P2 item 13): load a glTF/GLB with
// the same loader the Avatar viewer uses, flatten its meshes (bind pose, world
// transforms applied) into triangles, and sample them into dust targets.
import { sampleDustTargetsFromTriangles } from "../domain/echo-dust-swarm.js";

export const DUST_MODEL_MAX_TRIANGLES = 200_000;

/** Triangles (9 floats each) and per-triangle colours from a Three.js object tree. */
export function trianglesFromObject3D(root, { maxTriangles = DUST_MODEL_MAX_TRIANGLES } = {}) {
  root.updateMatrixWorld(true);
  const out = [], colours = [], v = [0, 0, 0];
  let total = 0;
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position || total >= maxTriangles) return;
    const position = node.geometry.attributes.position, index = node.geometry.index, e = node.matrixWorld.elements;
    const material = Array.isArray(node.material) ? node.material[0] : node.material, c = material?.color;
    const rgb = c ? [Math.round(Math.min(1, c.r) * 255), Math.round(Math.min(1, c.g) * 255), Math.round(Math.min(1, c.b) * 255)] : [220, 220, 220];
    const faces = (index ? index.count : position.count) / 3;
    for (let f = 0; f < faces && total < maxTriangles; f++, total++) {
      for (let k = 0; k < 3; k++) {
        const vi = index ? index.getX(f * 3 + k) : f * 3 + k;
        v[0] = position.getX(vi); v[1] = position.getY(vi); v[2] = position.getZ(vi);
        out.push(e[0] * v[0] + e[4] * v[1] + e[8] * v[2] + e[12], e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13], e[2] * v[0] + e[6] * v[1] + e[10] * v[2] + e[14]);
      }
      colours.push(...rgb);
    }
  });
  return { triangles: Float32Array.from(out), colors: Uint8Array.from(colours), truncated: total >= maxTriangles };
}

/** Load a model URL and sample it; resolves null when it cannot be loaded. */
export async function loadModelTargets(ref, count, seed) {
  try {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().loadAsync(ref.url);
    const { triangles, colors } = trianglesFromObject3D(gltf.scene);
    const points = sampleDustTargetsFromTriangles(triangles, { count, seed, colors });
    return points.count ? points : null;
  } catch {
    return null;
  }
}
