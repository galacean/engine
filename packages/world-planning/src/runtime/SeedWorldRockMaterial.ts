import { Color, MeshRenderer, type Engine, type Entity, type Material } from "@galacean/engine";
import { createSurfaceMaterial, bindSurfaceTerrain } from "@galacean/engine-terrain/surface/SurfaceMaterial";
const materials = new WeakMap<Engine, Material>();
/** Assigns one shared Surface material to legacy authored rock renderers.
 * @param engine Resource owner.
 * @param root Rock hierarchy.
 * @returns Number of assigned renderers.
 */
export function bindSeedWorldRockSurfaceMaterial(engine: Engine, root: Entity): number {
  let material = materials.get(engine);
  if (!material) {
    material = createSurfaceMaterial(engine, { baseColor: new Color(0.45, 0.4, 0.3, 1) });
    materials.set(engine, material);
  }
  const renderers = root.getComponentsIncludeChildren(MeshRenderer, []);
  for (const renderer of renderers) renderer.setMaterial(material);
  return renderers.length;
}
/** Refreshes shared ground appearance when terrain residency is published.
 * @param engine Resource owner.
 * @param terrain Current terrain material.
 */
export function synchronizeSeedWorldRockGroundAppearance(engine: Engine, terrain: Material): void {
  const material = materials.get(engine);
  if (material) bindSurfaceTerrain(material, terrain);
}
