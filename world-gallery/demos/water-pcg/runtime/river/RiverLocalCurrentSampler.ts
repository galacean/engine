/** CPU mirror of the River local-map RG flow blend used by the surface shader. */
import { RiverChunkSourceKind, RiverLocalMapRegionKind } from "../../compiler/river/RiverGeometryEnums";
import type { RiverLocalMapAtlasData, RiverLocalMapTileData } from "../../compiler/river/types";
import { RIVER_SURFACE_SHADER_TUNING } from "./constants";

const LOCAL_FLOW_SIGNAL_THRESHOLD = 0.05;

export interface RiverLocalCurrentSample {
  tileIndex: number;
  localFlowX: number;
  localFlowZ: number;
  finalFlowX: number;
  finalFlowZ: number;
  localFlowWeight: number;
  normalizedSignedDistance: number;
}

export function createRiverLocalCurrentSample(): RiverLocalCurrentSample {
  return {
    tileIndex: -1,
    localFlowX: 0,
    localFlowZ: 0,
    finalFlowX: 0,
    finalFlowZ: 0,
    localFlowWeight: 0,
    normalizedSignedDistance: 1
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const ratio = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-8), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
}

export class RiverLocalCurrentSampler {
  private readonly _pixels: Uint8Array;
  private _sampleCount = 0;
  private _appliedCount = 0;

  constructor(private readonly _atlas: RiverLocalMapAtlasData) {
    this._pixels = _atlas.pixels.toTypedArray();
  }

  get sampleCount(): number {
    return this._sampleCount;
  }

  get appliedCount(): number {
    return this._appliedCount;
  }

  sample(
    sourceKind: RiverChunkSourceKind,
    sourceIndex: number,
    worldX: number,
    worldZ: number,
    baseFlowX: number,
    baseFlowZ: number,
    out: RiverLocalCurrentSample
  ): boolean {
    this._sampleCount++;
    const baseSpeed = Math.hypot(baseFlowX, baseFlowZ);
    const inverseBaseSpeed = baseSpeed > 1e-8 ? 1 / baseSpeed : 0;
    const baseDirectionX = baseSpeed > 1e-8 ? baseFlowX * inverseBaseSpeed : 0;
    const baseDirectionZ = baseSpeed > 1e-8 ? baseFlowZ * inverseBaseSpeed : 1;
    out.tileIndex = -1;
    out.localFlowX = 0;
    out.localFlowZ = 0;
    out.finalFlowX = baseFlowX;
    out.finalFlowZ = baseFlowZ;
    out.localFlowWeight = 0;
    out.normalizedSignedDistance = 1;
    const tileIndex = this._resolveTileIndex(sourceKind, sourceIndex, worldX, worldZ);
    if (tileIndex < 0) return false;
    const tile = this._atlas.tiles[tileIndex];
    const rawU = worldX * tile.worldToUv[0] + tile.worldToUv[2];
    const rawV = worldZ * tile.worldToUv[1] + tile.worldToUv[3];
    const insideRect =
      rawU >= tile.uvRect[0] && rawU <= tile.uvRect[2] && rawV >= tile.uvRect[1] && rawV <= tile.uvRect[3];
    if (!insideRect) return false;
    const u = clamp(rawU, tile.uvRect[0], tile.uvRect[2]);
    const v = clamp(rawV, tile.uvRect[1], tile.uvRect[3]);
    const localFlowX = this._sampleChannel(u, v, 0) * 2 - 1;
    const localFlowZ = this._sampleChannel(u, v, 1) * 2 - 1;
    const normalizedSignedDistance = this._sampleChannel(u, v, 3) * 2 - 1;
    const localLengthSquared = localFlowX * localFlowX + localFlowZ * localFlowZ;
    const localLength = Math.sqrt(localLengthSquared);
    const localDirectionX = localLength > 1e-8 ? localFlowX / localLength : baseDirectionX;
    const localDirectionZ = localLength > 1e-8 ? localFlowZ / localLength : baseDirectionZ;
    const confluence = tile.kind === RiverLocalMapRegionKind.Confluence;
    const interiorWeight = smoothstep(
      0,
      RIVER_SURFACE_SHADER_TUNING.confluenceInteriorBlendWidth,
      Math.max(normalizedSignedDistance, 0)
    );
    const localEffectWeight = confluence ? interiorWeight : 1;
    const confluenceWeight = confluence ? RIVER_SURFACE_SHADER_TUNING.confluenceFlowBlendWeight : 1;
    const localFlowWeight =
      (localLengthSquared >= LOCAL_FLOW_SIGNAL_THRESHOLD ? 1 : 0) * localEffectWeight * confluenceWeight;
    let finalDirectionX = baseDirectionX + (localDirectionX - baseDirectionX) * localFlowWeight;
    let finalDirectionZ = baseDirectionZ + (localDirectionZ - baseDirectionZ) * localFlowWeight;
    const finalLength = Math.hypot(finalDirectionX, finalDirectionZ) || 1;
    finalDirectionX /= finalLength;
    finalDirectionZ /= finalLength;
    out.tileIndex = tileIndex;
    out.localFlowX = localFlowX;
    out.localFlowZ = localFlowZ;
    out.finalFlowX = finalDirectionX * baseSpeed;
    out.finalFlowZ = finalDirectionZ * baseSpeed;
    out.localFlowWeight = localFlowWeight;
    out.normalizedSignedDistance = normalizedSignedDistance;
    if (localFlowWeight > 0) this._appliedCount++;
    return true;
  }

  private _resolveTileIndex(
    sourceKind: RiverChunkSourceKind,
    sourceIndex: number,
    worldX: number,
    worldZ: number
  ): number {
    if (sourceKind === RiverChunkSourceKind.Junction) {
      for (let index = 0; index < this._atlas.tiles.length; index++) {
        const tile = this._atlas.tiles[index];
        if (tile.kind === RiverLocalMapRegionKind.Confluence && tile.sourceIndex === sourceIndex) return index;
      }
      return -1;
    }
    let bestIndex = -1;
    let bestDistanceSquared = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this._atlas.tiles.length; index++) {
      const tile = this._atlas.tiles[index];
      if (tile.kind !== RiverLocalMapRegionKind.Obstacle || !this._contains(tile, worldX, worldZ)) continue;
      const centerX = (tile.min[0] + tile.max[0]) * 0.5;
      const centerZ = (tile.min[1] + tile.max[1]) * 0.5;
      const distanceSquared = (worldX - centerX) ** 2 + (worldZ - centerZ) ** 2;
      if (distanceSquared < bestDistanceSquared) {
        bestDistanceSquared = distanceSquared;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  private _contains(tile: RiverLocalMapTileData, worldX: number, worldZ: number): boolean {
    return worldX >= tile.min[0] && worldX <= tile.max[0] && worldZ >= tile.min[1] && worldZ <= tile.max[1];
  }

  private _sampleChannel(u: number, v: number, channel: 0 | 1 | 3): number {
    const pixelX = clamp(u * this._atlas.width - 0.5, 0, this._atlas.width - 1);
    const pixelY = clamp(v * this._atlas.height - 0.5, 0, this._atlas.height - 1);
    const x0 = Math.floor(pixelX);
    const y0 = Math.floor(pixelY);
    const x1 = Math.min(this._atlas.width - 1, x0 + 1);
    const y1 = Math.min(this._atlas.height - 1, y0 + 1);
    const tx = pixelX - x0;
    const ty = pixelY - y0;
    const topLeft = this._pixels[(y0 * this._atlas.width + x0) * 4 + channel] / 255;
    const topRight = this._pixels[(y0 * this._atlas.width + x1) * 4 + channel] / 255;
    const bottomLeft = this._pixels[(y1 * this._atlas.width + x0) * 4 + channel] / 255;
    const bottomRight = this._pixels[(y1 * this._atlas.width + x1) * 4 + channel] / 255;
    const top = topLeft * (1 - tx) + topRight * tx;
    const bottom = bottomLeft * (1 - tx) + bottomRight * tx;
    return top * (1 - ty) + bottom * ty;
  }
}
