// Android Scene Viewer cannot read Draco meshes or WebP textures, so AR gets a plain GLB (JPEG textures, no extensions).
// Usage: node scripts/make-ar-glb.mjs <in-dir> <out-dir>
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
for (const f of fs.readdirSync(inDir).filter((n) => n.endsWith('.glb'))) {
  const doc = await io.read(path.join(inDir, f));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 90 }), prune());
  for (const ext of doc.getRoot().listExtensionsUsed()) ext.dispose();
  await io.write(path.join(outDir, f), doc);
  const b = fs.readFileSync(path.join(outDir, f));
  const j = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)));
  console.log(f, (b.length / 1048576).toFixed(1) + 'MB', 'ext:', j.extensionsUsed, 'imgs:', j.images?.map((i) => i.mimeType).join(','));
}
