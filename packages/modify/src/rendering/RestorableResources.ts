import { ContentRestorer, type EngineObject, type Buffer, type ModelMesh } from "@galacean/engine";

/** The resource owns both its GPU allocation and the recipe for its contents.
 * Engine teardown removes the restorer with the resource, including shared leases.
 * Recipes are synchronous: DeviceRestored is emitted only after all uploads finish.
 */
export function restoreResource<T extends EngineObject>(resource: T, upload: () => void): T {
  class Restorer extends ContentRestorer<T> {
    restoreContent(): void {
      if (!resource.destroyed && !resource.pendingDestroy) upload();
    }
  }
  resource.engine.resourceManager.addContentRestorer(new Restorer(resource));
  return resource;
}

/** Keep the producer-owned bytes, not a GPU download or a second shadow copy.
 * Mutable producers must update this same array before calling setData. */
export function restoreBuffer(buffer: Buffer, data: ArrayBuffer | ArrayBufferView): Buffer {
  return restoreResource(buffer, () => buffer.setData(data));
}

/** Retain only packed geometry for an immutable published mesh. Advanced JS
 * vertex objects are released normally. No extra GPU upload on the normal path. */
export function uploadRestorableModelMesh(mesh: ModelMesh): void {
  const indices = mesh.getIndices();
  mesh.uploadData(false);
  const buffers = mesh.vertexBufferBindings
    .filter((value): value is NonNullable<typeof value> => value != null)
    .map((binding) => {
      const data = binding.buffer.data;
      if (!data) throw new Error("Restorable mesh requires retained readable vertex bytes");
      return { buffer: binding.buffer, data };
    });
  const index = modelMeshIndex(mesh);
  restoreResource(mesh, () => {
    for (const { buffer, data } of buffers) buffer.setData(data);
    if (index && indices) index.setData(indices);
  });
  mesh.uploadData(true);
}

/** Published views own their generated buffers as well as the ModelMesh wrapper.
 * Call after detaching its renderers; Engine's ModelMesh.destroy does not dispose
 * its vertex/index buffers. This helper is only for uniquely owned view meshes. */
export function destroyOwnedModelMesh(mesh: ModelMesh): void {
  if (mesh.destroyed || mesh.pendingDestroy) return;
  const buffers = new Set(
    mesh.vertexBufferBindings
      .filter((value): value is NonNullable<typeof value> => value != null)
      .map((binding) => binding.buffer)
  );
  const index = modelMeshIndex(mesh);
  if (index) buffers.add(index);
  mesh.destroy();
  for (const buffer of buffers) buffer.destroy();
}

/** ModelMesh does not expose the index binding that it allocates. Keep this
 * pinned-Engine bridge at the resource owner; consumers never reinterpret it.
 * Verified against ModelMesh.uploadData and Primitive.indexBufferBinding. */
function modelMeshIndex(mesh: ModelMesh): Buffer | undefined {
  return (mesh as unknown as { _primitive: { indexBufferBinding?: { buffer: Buffer } } })._primitive.indexBufferBinding
    ?.buffer;
}
