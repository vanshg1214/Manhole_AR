// Merges the static parts of the manhole model into one mesh (38 draw calls -> few) and
// re-encodes textures as JPEG. The animated lid node is left untouched.
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { flatten, join, textureCompress, dedup, prune } from '@gltf-transform/functions';
const [inp, out] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const draws = () => doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).length;
console.log('primitives before', draws());
await doc.transform(
  dedup(),
  flatten(),
  join({ keepMeshes: false, keepNamed: false }),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', quality: 90 }),
  prune(),
);
console.log('primitives after', draws());
const anim = doc.getRoot().listAnimations()[0];
console.log('anim targets', [...new Set(anim.listChannels().map(c => c.getTargetNode().getName()))],
  'mesh on animated node', !!anim.listChannels()[0].getTargetNode().getMesh());
await io.write(out, doc);
