import type { TerrainProjectAsset } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";

/** World-space Region bounds consumed by renderer-independent probe authoring. */
export interface TerrainProbeVolumeRegionSource {
  /** Stable Region identity used by diagnostics. */
  readonly id: string;
  /** World-space minimum X and Z plus the Region height origin. */
  readonly worldPosition: readonly [x: number, y: number, z: number];
  /** World-space Region extent. */
  readonly worldSize: readonly [x: number, y: number, z: number];
  /** Minimum decoded height relative to `worldPosition.y`. */
  readonly minimumHeight: number;
  /** Maximum decoded height relative to `worldPosition.y`. */
  readonly maximumHeight: number;
}

/** Read-only source boundary shared by authored and generated Terrain worlds. */
export interface TerrainProbeVolumeRegionSourceProvider {
  /** Immutable Region bounds used to derive one complete probe layout. */
  readonly regions: readonly TerrainProbeVolumeRegionSource[];
}

/**
 * Captures arbitrary Region bounds behind one immutable provider.
 * @param regions Region bounds to detach from their runtime owner.
 * @returns Read-only provider with copied tuple values.
 */
export function createTerrainProbeVolumeRegionSourceProvider(
  regions: readonly TerrainProbeVolumeRegionSource[]
): TerrainProbeVolumeRegionSourceProvider {
  return Object.freeze({
    regions: Object.freeze(
      regions.map((region) =>
        Object.freeze({
          ...region,
          worldPosition: Object.freeze([...region.worldPosition]) as TerrainProbeVolumeRegionSource["worldPosition"],
          worldSize: Object.freeze([...region.worldSize]) as TerrainProbeVolumeRegionSource["worldSize"]
        })
      )
    )
  });
}

/**
 * Adapts loaded canonical Terrain Project assets without retaining their runtime owner.
 * @param assets Currently loaded canonical Region assets.
 * @returns Immutable Region provider detached from the World runtime.
 */
export function createTerrainProjectProbeVolumeRegionSourceProvider(
  assets: readonly TerrainProjectAsset[]
): TerrainProbeVolumeRegionSourceProvider {
  return createTerrainProbeVolumeRegionSourceProvider(
    assets.map((asset) => ({
      id: asset.document.descriptor.id,
      worldPosition: asset.document.descriptor.worldPosition,
      worldSize: asset.document.descriptor.worldSize,
      minimumHeight: asset.document.manifest.heightmap.minMetres,
      maximumHeight: asset.document.manifest.heightmap.maxMetres
    }))
  );
}
