import {
  packTerrainAtlasRectangles,
  TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS,
  TerrainAtlasError,
  TerrainAtlasErrorCode,
  type TerrainAtlasRectangle
} from "./TerrainHeightAtlas";

/** Renderer-facing lossless Region holes source independent of Project serialization. */
export interface TerrainClipmapHolesSource {
  readonly id: string;
  readonly holesSampleSize: readonly [width: number, height: number];
  readonly holesSolidValue: number;
  readonly holes: Uint8Array;
}

/** Atlas rectangle and authored solid value assigned to one stable Region id. */
export interface TerrainHolesAtlasRegion extends TerrainAtlasRectangle {
  readonly solidValue: number;
}

/** Exact one-byte holes atlas built from a loaded renderer residency set. */
export interface TerrainHolesAtlasPacking {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly regions: readonly TerrainHolesAtlasRegion[];
}

/**
 * Packs variable-size R8 holes cells without changing canonical Region data.
 * @param sources Loaded renderer-neutral holes sources.
 * @param maxTextureSize Device texture dimension limit.
 * @returns Deterministic one-byte atlas ordered by stable Region id.
 * @throws {@link TerrainAtlasError} if input is invalid or exceeds renderer capability.
 */
export function packTerrainHolesAtlas(
  sources: readonly TerrainClipmapHolesSource[],
  maxTextureSize: number
): TerrainHolesAtlasPacking {
  if (!sources.length) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.InvalidSource,
      "Geometry Clipmap holes residency requires at least one Region"
    );
  }
  if (sources.length > TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS) {
    throw new TerrainAtlasError(
      TerrainAtlasErrorCode.ActiveRegionLimit,
      `Geometry Clipmap supports at most ${TERRAIN_CLIPMAP_MAX_ACTIVE_REGIONS} active Regions; received ${sources.length}`
    );
  }

  for (const source of sources) {
    const [width, height] = source.holesSampleSize;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Geometry Clipmap Region "${source.id}" has an invalid holes sample size`
      );
    }
    if (source.holes.length !== width * height) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Geometry Clipmap Region "${source.id}" holes payload size does not match its sample size`
      );
    }
    if (!Number.isInteger(source.holesSolidValue) || source.holesSolidValue < 0 || source.holesSolidValue > 255) {
      throw new TerrainAtlasError(
        TerrainAtlasErrorCode.InvalidSource,
        `Geometry Clipmap Region "${source.id}" has an invalid holes solid value`
      );
    }
  }

  const layout = packTerrainAtlasRectangles(
    sources.map((source) => ({
      id: source.id,
      width: source.holesSampleSize[0],
      height: source.holesSampleSize[1]
    })),
    maxTextureSize
  );
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const pixels = new Uint8Array(layout.width * layout.height);
  for (const region of layout.rectangles) {
    const source = sourceById.get(region.id)!;
    for (let localY = 0; localY < region.height; localY++) {
      const sourceStart = localY * region.width;
      const atlasStart = (region.y + localY) * layout.width + region.x;
      pixels.set(source.holes.subarray(sourceStart, sourceStart + region.width), atlasStart);
    }
  }

  return {
    width: layout.width,
    height: layout.height,
    pixels,
    regions: layout.rectangles.map(
      (region): TerrainHolesAtlasRegion => ({
        ...region,
        solidValue: sourceById.get(region.id)!.holesSolidValue
      })
    )
  };
}
