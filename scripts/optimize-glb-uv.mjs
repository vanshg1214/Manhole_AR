// UV- and normal-aware decimation (keeps texture mapping and shading intact on flat walls).
// Usage: node scripts/optimize-glb-uv.mjs <in.glb> <out.glb> <targetTriangles> <maxTexture> [draco]
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weld, dedup, prune, textureCompress, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const [inp, out, target, maxTex, useDraco] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(inp);
await MeshoptSimplifier.ready;
await doc.transform(dedup(), weld());

const prims = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives());
const triCount = (p) => p.getIndices().getCount() / 3;
const before = prims.reduce((n, p) => n + triCount(p), 0);
const ratio = Math.min(1, Number(target) / before);

for (const p of prims) {
  const pos = p.getAttribute('POSITION');
  const nrm = p.getAttribute('NORMAL');
  const uv = p.getAttribute('TEXCOORD_0');
  const n = pos.getCount();
  // interleave normal(3) + uv(2) as simplifier attributes
  const attrs = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) {
    const nv = nrm ? nrm.getElement(i, []) : [0, 0, 0];
    const tv = uv ? uv.getElement(i, []) : [0, 0];
    attrs.set([nv[0], nv[1], nv[2], tv[0], tv[1]], i * 5);
  }
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) positions.set(pos.getElement(i, []), i * 3);
  const indices = Uint32Array.from(p.getIndices().getArray());
  const targetIdx = Math.max(300, Math.floor((indices.length * ratio) / 3) * 3);
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, attrs, 5, [1.0, 1.0, 1.0, 4.0, 4.0], null, targetIdx, 0.05, []
  );
  p.getIndices().setArray(simplified);
  compactPrimitive(p);
}

const steps = [prune()];
if (maxTex && Number(maxTex) > 0)
  steps.unshift(textureCompress({ encoder: sharp, resize: [Number(maxTex), Number(maxTex)], targetFormat: 'jpeg', quality: 90 }));
await doc.transform(...steps);
if (useDraco)
  doc.createExtension(KHRDracoMeshCompression).setRequired(true)
    .setEncoderOptions({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5, quantizePosition: 16, quantizeNormal: 12, quantizeTexcoord: 14 });
const after = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + triCount(p), 0);
await io.write(out, doc);
console.log(`${Math.round(before)} -> ${Math.round(after)} tris`);
