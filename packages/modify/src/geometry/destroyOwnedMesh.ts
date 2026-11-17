import type { Buffer, BufferMesh, ModelMesh } from "@galacean/engine-core";

type OwnedMesh = BufferMesh | ModelMesh;

/** Releases a procedurally created mesh and its exclusively owned buffers, without global GC. */
export function destroyOwnedMesh(mesh: OwnedMesh | undefined): void {
  if (!mesh || mesh.destroyed) return;
  destroyOwnedMeshSet([mesh]);
}

/** Releases a complete mesh asset set after its borrowers detach, including buffers shared within the set. */
export function destroyOwnedMeshSet(meshes: Iterable<OwnedMesh>): void {
  const liveMeshes = new Set<OwnedMesh>();
  const buffers = new Set<Buffer>();
  // Mesh destruction releases references, but Buffer resources otherwise wait for ResourceManager.gc().
  // The set must exclusively own every buffer; never pass a subset of an imported/shared asset set.
  for (const mesh of meshes) {
    if (mesh.destroyed || liveMeshes.has(mesh)) continue;
    liveMeshes.add(mesh);
    for (const binding of mesh.vertexBufferBindings ?? []) if (binding) buffers.add(binding.buffer);
    // The engine declaration bundle hides this internal index-buffer accessor.
    const ownedPrimitive = (mesh as OwnedMesh & { _primitive?: { indexBufferBinding?: { _buffer: Buffer } } })
      ._primitive;
    const indexBuffer = ownedPrimitive?.indexBufferBinding?._buffer;
    if (indexBuffer) buffers.add(indexBuffer);
  }
  liveMeshes.forEach((mesh) => mesh.destroy(true));
  buffers.forEach((buffer) => buffer.destroy(true));
}
