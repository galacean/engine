import { Texture2D, Texture2DArray } from "@galacean/engine";

/** CPU data retained for one terrain region. */
export interface TerrainRegionData {
  readonly location: readonly [x: number, z: number];
  readonly heights: Uint16Array;
  readonly control: Uint32Array;
}

/** GPU resources and stable region-space queries for one terrain dataset. */
export class TerrainData {
  readonly regionSize: number;
  readonly regionMapSize: number;
  readonly vertexSpacing: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly regions: readonly TerrainRegionData[];
  readonly heightMaps: Texture2DArray;
  readonly controlMaps: Texture2DArray;
  readonly colorMaps: Texture2DArray;
  readonly regionMap: Texture2D;

  private readonly _regionLayers: Int16Array;

  /**
   * Creates a validated terrain data object from loader-owned resources.
   * @param regionSize Region edge length in texels.
   * @param regionMapSize Number of region slots along each region-map axis.
   * @param vertexSpacing World metres represented by one height texel.
   * @param minHeight Elevation represented by uint16 zero.
   * @param maxHeight Elevation represented by uint16 65535.
   * @param regions CPU region payloads in texture-array order.
   * @param regionLayers Region-map values stored as zero-based layers, with -1 for missing regions.
   * @param heightMaps GPU height texture array.
   * @param controlMaps GPU control texture array.
   * @param colorMaps GPU color/roughness texture array.
   * @param regionMap GPU region lookup texture.
   */
  constructor(
    regionSize: number,
    regionMapSize: number,
    vertexSpacing: number,
    minHeight: number,
    maxHeight: number,
    regions: readonly TerrainRegionData[],
    regionLayers: Int16Array,
    heightMaps: Texture2DArray,
    controlMaps: Texture2DArray,
    colorMaps: Texture2DArray,
    regionMap: Texture2D
  ) {
    this.regionSize = regionSize;
    this.regionMapSize = regionMapSize;
    this.vertexSpacing = vertexSpacing;
    this.minHeight = minHeight;
    this.maxHeight = maxHeight;
    this.regions = regions;
    this._regionLayers = regionLayers;
    this.heightMaps = heightMaps;
    this.controlMaps = controlMaps;
    this.colorMaps = colorMaps;
    this.regionMap = regionMap;
  }

  /**
   * Resolves a stable terrain region location to its transient texture-array layer.
   * @param locationX Region-space X coordinate.
   * @param locationZ Region-space Z coordinate.
   * @returns Zero-based texture-array layer, or -1 when the region is absent/out of bounds.
   */
  getRegionLayer(locationX: number, locationZ: number): number {
    const halfMap = this.regionMapSize / 2;
    const mapX = locationX + halfMap;
    const mapZ = locationZ + halfMap;
    if (mapX < 0 || mapX >= this.regionMapSize || mapZ < 0 || mapZ >= this.regionMapSize) {
      return -1;
    }
    return this._regionLayers[mapZ * this.regionMapSize + mapX];
  }

  /**
   * Samples the nearest exported height at a world-space XZ position.
   * @param worldX World-space X coordinate in metres.
   * @param worldZ World-space Z coordinate in metres.
   * @returns Height in metres, or undefined outside loaded regions.
   */
  sampleHeight(worldX: number, worldZ: number): number | undefined {
    return this._sampleHeightAtGrid(Math.round(worldX / this.vertexSpacing), Math.round(worldZ / this.vertexSpacing));
  }

  /**
   * Samples a continuous height by bilinearly interpolating the four surrounding height texels.
   * @param worldX World-space X coordinate in metres.
   * @param worldZ World-space Z coordinate in metres.
   * @returns Height in metres, or undefined when one of the surrounding samples is outside loaded regions.
   */
  sampleHeightInterpolated(worldX: number, worldZ: number): number | undefined {
    const sampleX = worldX / this.vertexSpacing;
    const sampleZ = worldZ / this.vertexSpacing;
    const gridX = Math.floor(sampleX);
    const gridZ = Math.floor(sampleZ);
    const height00 = this._sampleHeightAtGrid(gridX, gridZ);
    const height10 = this._sampleHeightAtGrid(gridX + 1, gridZ);
    const height01 = this._sampleHeightAtGrid(gridX, gridZ + 1);
    const height11 = this._sampleHeightAtGrid(gridX + 1, gridZ + 1);
    if (height00 === undefined || height10 === undefined || height01 === undefined || height11 === undefined) return undefined;

    const fractionX = sampleX - gridX;
    const fractionZ = sampleZ - gridZ;
    const lower = height00 + (height10 - height00) * fractionX;
    const upper = height01 + (height11 - height01) * fractionX;
    return lower + (upper - lower) * fractionZ;
  }

  /**
   * Samples the nearest raw terrain control word at a world-space XZ position.
   * @param worldX World-space X coordinate in metres.
   * @param worldZ World-space Z coordinate in metres.
   * @returns Unsigned control word, or undefined outside loaded regions.
   */
  sampleControl(worldX: number, worldZ: number): number | undefined {
    const sample = this._resolveSample(worldX, worldZ);
    return sample ? this.regions[sample.layer].control[sample.index] : undefined;
  }

  private _resolveSample(worldX: number, worldZ: number): { layer: number; index: number } | undefined {
    const gridX = Math.round(worldX / this.vertexSpacing);
    const gridZ = Math.round(worldZ / this.vertexSpacing);
    return this._resolveGridSample(gridX, gridZ);
  }

  private _sampleHeightAtGrid(gridX: number, gridZ: number): number | undefined {
    const sample = this._resolveGridSample(gridX, gridZ);
    if (!sample) return undefined;
    const raw = this.regions[sample.layer].heights[sample.index];
    return this.minHeight + (raw / 65535) * (this.maxHeight - this.minHeight);
  }

  private _resolveGridSample(gridX: number, gridZ: number): { layer: number; index: number } | undefined {
    const regionX = Math.floor(gridX / this.regionSize);
    const regionZ = Math.floor(gridZ / this.regionSize);
    const layer = this.getRegionLayer(regionX, regionZ);
    if (layer < 0) return undefined;

    const localX = positiveModulo(gridX, this.regionSize);
    const localZ = positiveModulo(gridZ, this.regionSize);
    return { layer, index: localZ * this.regionSize + localX };
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
