import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of process.argv.slice(2)) {
  const b = getBounds(((await io.read(f)).getRoot().listScenes()[0]));
  console.log(f.split(/[\/]/).pop(), 'size', b.max.map((v, i) => +(v - b.min[i]).toFixed(4)));
}
