import type { MasonryDocument } from "./MasonryDocument";
import type { ConstructionTerrainGrid } from "./ConstructionTerrain";
import type { ConstructionGroundMesh } from "./ConstructionGroundSupports";
const boundsCache = new WeakMap<ConstructionGroundMesh, number[]>();
function bounds(mesh: ConstructionGroundMesh): number[] {
  let b = boundsCache.get(mesh);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      b[0] = Math.min(b[0], mesh.positions[i]);
      b[1] = Math.min(b[1], mesh.positions[i + 2]);
      b[2] = Math.max(b[2], mesh.positions[i]);
      b[3] = Math.max(b[3], mesh.positions[i + 2]);
    }
    boundsCache.set(mesh, b);
  }
  return b;
}
/** Conservative world-space region used by terrain/support consumers, including the support halo. */
export function constructionSupportRegion(document: MasonryDocument) {
  const placement = document.placement ?? { position: [0, 0, 0], rotationY: 0 },
    c = Math.cos(placement.rotationY),
    s = Math.sin(placement.rotationY),
    region = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of document.construction.buildings) {
    const center = b.circle?.center ?? b.rectangle!.center,
      angle = b.rectangle?.rotation ?? 0,
      w =
        b.circle?.radius ??
        (Math.abs(Math.cos(angle)) * b.rectangle!.size[0] + Math.abs(Math.sin(angle)) * b.rectangle!.size[1]) / 2,
      d =
        b.circle?.radius ??
        (Math.abs(Math.sin(angle)) * b.rectangle!.size[0] + Math.abs(Math.cos(angle)) * b.rectangle!.size[1]) / 2;
    for (const x of [center[0] - w - 2, center[0] + w + 2])
      for (const z of [center[1] - d - 2, center[1] + d + 2]) {
        const wx = placement.position[0] + c * x + s * z,
          wz = placement.position[2] - s * x + c * z;
        region[0] = Math.min(region[0], wx);
        region[1] = Math.min(region[1], wz);
        region[2] = Math.max(region[2], wx);
        region[3] = Math.max(region[3], wz);
      }
  }
  return region;
}
/** Copy only nearby immutable rock meshes into a short-lived topology worker.
 * Cache mesh extents once on the host; never detach accepted terrain/rock data. */
export function constructionSupportMeshes(document: MasonryDocument, terrain: ConstructionTerrainGrid) {
  const region = constructionSupportRegion(document);
  return (
    terrain.supports?.filter((mesh) => {
      const b = bounds(mesh);
      return b[2] >= region[0] && b[0] <= region[2] && b[3] >= region[1] && b[1] <= region[3];
    }) ?? []
  );
}

export function copyConstructionTerrain(document: MasonryDocument, terrain: ArrayBuffer | ConstructionTerrainGrid) {
  if (terrain instanceof ArrayBuffer) return terrain.slice(0);
  return {
    ...terrain,
    samples: terrain.samples.slice(),
    supports: constructionSupportMeshes(document, terrain).map((mesh) => ({
      positions: mesh.positions.slice(),
      indices: mesh.indices.slice()
    }))
  };
}
