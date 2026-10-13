import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const r = doc.getRoot();
for (const m of r.listMaterials()) {
  console.log('material', m.getName(), 'alpha', m.getAlphaMode(), 'doubleSided', m.getDoubleSided());
  for (const [k, t] of [['base', m.getBaseColorTexture()], ['mr', m.getMetallicRoughnessTexture()], ['normal', m.getNormalTexture()], ['occl', m.getOcclusionTexture()], ['emis', m.getEmissiveTexture()]])
    if (t) console.log(' ', k, t.getURI(), t.getMimeType(), t.getSize(), (t.getImage().byteLength/1024|0)+'KB');
  console.log('  factors', m.getBaseColorFactor(), 'metal', m.getMetallicFactor(), 'rough', m.getRoughnessFactor());
}
for (const a of r.listAnimations()) {
  const targets = new Set(a.listChannels().map(c => c.getTargetNode()?.getName()));
  console.log('anim', a.getName(), 'channels', a.listChannels().length, 'targets', [...targets].join(','));
}
console.log('scene nodes', r.listNodes().map(n => n.getName() + (n.getMesh() ? '*' : '')).join(' | '));
