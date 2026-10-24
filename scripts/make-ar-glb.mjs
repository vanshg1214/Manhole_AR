// Android Scene Viewer is fragile: no Draco meshes, no WebP textures, and it is safest with a flat scene (no wrapper
// nodes) and a modest triangle budget. This builds a plain GLB for AR from each web model.
// Usage: node scripts/make-ar-glb.mjs <in-dir> <out-dir> [maxTriangles]
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import os from 'os';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, clearNodeTransform, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const [inDir, outDir, tris = '40000'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
for (const f of fs.readdirSync(inDir).filter((n) => n.endsWith('.glb'))) {
  const mid = path.join(tmp, f);
  execFileSync('node', [path.join(import.meta.dirname, 'optimize-glb-uv.mjs'), path.join(inDir, f), mid, tris, '1024'], { stdio: 'ignore' });
  const doc = await io.read(mid);
  await doc.transform(flatten());
  for (const n of doc.getRoot().listNodes()) if (n.getMesh()) clearNodeTransform(n);
  await doc.transform(prune());
  for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose();
  await io.write(path.join(outDir, f), doc);
  const b = fs.readFileSync(path.join(outDir, f));
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)));
  console.log(f, (b.length / 1048576).toFixed(1) + 'MB', 'nodes', j.nodes.length, 'ext', j.extensionsUsed, j.images.map((i) => i.mimeType).join(','));
}
