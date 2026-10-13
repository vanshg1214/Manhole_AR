import sharp from 'sharp';
// Usage: node scripts/optimize-glb.mjs <in.glb> <out.glb> <targetTriangles> <maxTextureSize> [draco]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, textureCompress, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

const [inp, out, targetTris, maxTex, useDraco] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(inp);
const count = () => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
  .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
const before = count();
await MeshoptSimplifier.ready;
const ratio = Math.min(1, Number(targetTris) / before);
await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.003, lockBorder: false }),
  textureCompress({ encoder: sharp, resize: [Number(maxTex), Number(maxTex)], targetFormat: 'jpeg', quality: 82 }),
  prune(),
);
if (useDraco) doc.createExtension((await import('@gltf-transform/extensions')).KHRDracoMeshCompression)
  .setRequired(true).setEncoderOptions({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5 });
await io.write(out, doc);
console.log(`${inp}: ${Math.round(before)} -> ${Math.round(count())} tris`);
