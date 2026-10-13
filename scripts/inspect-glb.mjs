import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule()});
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const root = doc.getRoot();
  let verts = 0, tris = 0, prims = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    prims++;
    verts += p.getAttribute('POSITION')?.getCount() ?? 0;
    const idx = p.getIndices();
    tris += (idx ? idx.getCount() : (p.getAttribute('POSITION')?.getCount() ?? 0)) / 3;
  }
  const tex = root.listTextures().map(t => `${t.getMimeType().split('/')[1]} ${t.getSize()?.join('x')} ${(t.getImage().byteLength/1024).toFixed(0)}KB`);
  console.log(`\n${f}\n nodes=${root.listNodes().length} meshes=${root.listMeshes().length} prims=${prims} verts=${verts} tris=${Math.round(tris)} materials=${root.listMaterials().length} anims=${root.listAnimations().length}`);
  console.log(' extensions:', root.listExtensionsUsed().map(e=>e.extensionName).join(', ') || '-');
  console.log(' textures:', tex.join(' | ') || '-');
}
