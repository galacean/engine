import type { TerrainClipmapHolesSource } from "./TerrainHolesAtlas";
import type { TerrainClipmapHeightSource } from "./TerrainHeightAtlas";

/** Height payload plus optional derived normals and authored holes for one active Region. */
export interface TerrainClipmapRegionSource extends TerrainClipmapHeightSource {
  /** Heightmap-aligned RG8 encoded world-XZ normal components. */
  readonly normalSamples?: Uint8Array;
  /** Hole-cell dimensions; omitted together with the other holes fields for a fully solid Region. */
  readonly holesSampleSize?: TerrainClipmapHolesSource["holesSampleSize"];
  /** R8 value representing solid cells; omitted together with the other holes fields. */
  readonly holesSolidValue?: TerrainClipmapHolesSource["holesSolidValue"];
  /** Row-major R8 hole cells; omitted together with the other holes fields. */
  readonly holes?: TerrainClipmapHolesSource["holes"];
}

/**
 * Resolves the uniform optional holes capability for one active residency set.
 * @param sources Active Terrain Regions sharing one holes capability.
 * @returns Canonical holes sources, or `undefined` when every Region is fully solid.
 * @throws When a Region has a partial holes payload or active Regions mix holes and no-holes contracts.
 */
export function resolveTerrainClipmapHolesSources(
  sources: readonly TerrainClipmapRegionSource[]
): readonly TerrainClipmapHolesSource[] | undefined {
  const resolved: TerrainClipmapHolesSource[] = [];
  for (const source of sources) {
    const fields = [source.holesSampleSize, source.holesSolidValue, source.holes];
    let presentCount = 0;
    for (const value of fields) presentCount += Number(value !== undefined);
    if (presentCount === 0) continue;
    if (presentCount !== fields.length) {
      throw new Error(`Geometry Clipmap Region "${source.id}" has a partial holes payload`);
    }
    resolved.push(source as TerrainClipmapHolesSource);
  }
  if (resolved.length > 0 && resolved.length !== sources.length) {
    throw new Error("Geometry Clipmap active Regions must either all provide holes or all be fully solid");
  }
  return resolved.length > 0 ? resolved : undefined;
}
