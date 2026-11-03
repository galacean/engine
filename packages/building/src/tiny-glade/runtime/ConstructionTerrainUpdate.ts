import type { MasonryDocument } from "./MasonryDocument";
import type { ConstructionTerrainGrid } from "./ConstructionTerrain";
import { constructionSupportRegion } from "./ConstructionTerrainTransfer";

/** Exact texel comparison over a conservative support/render domain, including
 * both bilinear neighbours. A revision alone never forces an unaffected house
 * to allocate new meshes. A changed lattice/decode invalidates every consumer. */
export function constructionTerrainAffects(
  document: MasonryDocument,
  before: ConstructionTerrainGrid,
  after: ConstructionTerrainGrid
): boolean {
  if (
    before.resolution !== after.resolution ||
    before.size !== after.size ||
    before.origin.some((v, i) => v !== after.origin[i]) ||
    before.decode.offset !== after.decode.offset ||
    before.decode.scale !== after.decode.scale ||
    before.supports !== after.supports
  )
    return true;
  const region = constructionSupportRegion(document);
  const n = before.resolution,
    scale = (n - 1) / before.size;
  const start = (v: number, axis: number) =>
    Math.max(0, Math.min(n - 1, Math.floor((v - before.origin[axis]) * scale)));
  const end = (v: number, axis: number) =>
    Math.max(0, Math.min(n - 1, Math.floor((v - before.origin[axis]) * scale) + 1));
  const x0 = start(region[0], 0),
    x1 = end(region[2], 0);
  const z0 = start(region[1], 1),
    z1 = end(region[3], 1);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const i = z * n + x;
      if (before.samples[i] !== after.samples[i]) return true;
    }
  return false;
}
