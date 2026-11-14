import { type Entity, type Material, MeshRenderer } from "@galacean/engine-core";

/** Release all renderer borrows of a retiring material set in one tree traversal. */
export function detachWaterOwnedMaterials(materials: ReadonlySet<Material>, root?: Entity): void {
  if (!materials.size || !root || root.destroyed) return;
  const errors: unknown[] = [];
  for (const renderer of root.getComponentsIncludeChildren(MeshRenderer, [])) {
    let bound: ReturnType<MeshRenderer["getMaterials"]>;
    try {
      bound = renderer.getMaterials();
    } catch (error) {
      errors.push(error);
      continue;
    }
    for (let index = 0; index < bound.length; index++) {
      const material = bound[index];
      if (material && materials.has(material)) {
        try {
          renderer.setMaterial(index, null);
        } catch (error) {
          errors.push(error);
        }
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Water material detachment reported multiple errors.");
}

/** Detach a private render material before retiring it, including during a frame.
 * Entity.destroy() may defer renderer teardown. setMaterial(null) releases native
 * Texture and Shader references immediately without touching the author's material.
 */
export function destroyWaterOwnedMaterial(material: Material | undefined, root?: Entity): void {
  if (!material || material.destroyed) return;
  detachWaterOwnedMaterials(new Set([material]), root);
  if (!material.destroy()) throw new Error(`Water render material '${material.name}' still has live borrowers.`);
}
