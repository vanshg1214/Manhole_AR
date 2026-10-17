// Turns a GLB upside-down (180deg about X) by wrapping its scene in a rotated node. Usage: node scripts/flip-glb.mjs <file.glb> [...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const scene = doc.getRoot().listScenes()[0];
  const wrapper = doc.createNode('flip').setRotation([1, 0, 0, 0]);
  for (const n of scene.listChildren()) { scene.removeChild(n); wrapper.addChild(n); }
  scene.addChild(wrapper);
  await io.write(f, doc);
  console.log('flipped', f);
}
