// Removes all animations from a GLB so AR viewers place it as a static object. Usage: node scripts/strip-animations.mjs <file.glb> [...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const anims = doc.getRoot().listAnimations();
  anims.forEach((a) => a.dispose());
  await doc.transform(prune());
  await io.write(f, doc);
  console.log(f, 'removed', anims.length, 'animation(s)');
}
