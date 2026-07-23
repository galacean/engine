import { RiverLocalMapRegionKind } from "../../compiler/river/RiverGeometryEnums";
import type { RiverLocalMapAtlasData, RiverLocalMapTileData } from "../../compiler/river/types";
import { RIVER_SURFACE_SHADER_TUNING } from "../river/constants";
import {
  WaterLocalModifierChannel,
  resetWaterLocalFieldSample,
  type WaterLocalFieldProvider,
  type WaterLocalFieldSample
} from "./WaterLocalFieldProvider";
import { WaterLocalModifierBlendMode, type WaterLocalModifierBinding } from "./WaterLocalModifier";

const LOCAL_FLOW_SIGNAL_THRESHOLD = 0.05;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const ratio = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-8), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
}

class RiverStaticLocalModifierTileProvider implements WaterLocalFieldProvider {
  readonly channels = WaterLocalModifierChannel.CurrentLarge | WaterLocalModifierChannel.FoamSource;

  constructor(
    private readonly _resource: RiverStaticLocalModifierResource,
    readonly tileIndex: number
  ) {}

  sampleLocalField(worldX: number, worldZ: number, outSample: WaterLocalFieldSample): boolean {
    resetWaterLocalFieldSample(outSample);
    const tile = this._resource.atlas.tiles[this.tileIndex];
    const rawU = worldX * tile.worldToUv[0] + tile.worldToUv[2];
    const rawV = worldZ * tile.worldToUv[1] + tile.worldToUv[3];
    if (rawU < tile.uvRect[0] || rawU > tile.uvRect[2] || rawV < tile.uvRect[1] || rawV > tile.uvRect[3]) {
      return false;
    }

    const u = clamp(rawU, tile.uvRect[0], tile.uvRect[2]);
    const v = clamp(rawV, tile.uvRect[1], tile.uvRect[3]);
    const localFlowX = this._resource.sampleChannel(u, v, 0) * 2 - 1;
    const localFlowZ = this._resource.sampleChannel(u, v, 1) * 2 - 1;
    const foam = this._resource.sampleChannel(u, v, 2);
    const signedDistance = this._resource.sampleChannel(u, v, 3) * 2 - 1;
    const localLengthSquared = localFlowX * localFlowX + localFlowZ * localFlowZ;
    const localLength = Math.sqrt(localLengthSquared);
    const confluence = tile.kind === RiverLocalMapRegionKind.Confluence;
    const interiorWeight = confluence
      ? smoothstep(0, RIVER_SURFACE_SHADER_TUNING.confluenceInteriorBlendWidth, Math.max(signedDistance, 0))
      : 1;
    const currentWeight =
      (localLengthSquared >= LOCAL_FLOW_SIGNAL_THRESHOLD ? 1 : 0) *
      interiorWeight *
      (confluence ? RIVER_SURFACE_SHADER_TUNING.confluenceFlowBlendWeight : 1);
    const foamWeight = interiorWeight * (confluence ? RIVER_SURFACE_SHADER_TUNING.confluenceFoamWeight : 1);

    if (localLength > 1e-8) {
      outSample.currentLargeX = (localFlowX / localLength) * currentWeight;
      outSample.currentLargeZ = (localFlowZ / localLength) * currentWeight;
    }
    outSample.foamSource = clamp(foam * foamWeight, 0, 1);
    return true;
  }
}

/**
 * One shared CPU backing for the immutable River atlas plus per-tile modifier adapters.
 *
 * `pixelBuffer` is intentionally created once so a future texture owner and every CPU
 * tile provider can share it instead of each calling `atlas.pixels.toTypedArray()`.
 */
export class RiverStaticLocalModifierResource {
  readonly pixelBuffer: Uint8Array;
  readonly tileProviders: readonly WaterLocalFieldProvider[];

  constructor(readonly atlas: RiverLocalMapAtlasData) {
    if (atlas.width < 1 || atlas.height < 1 || atlas.pixels.length !== atlas.width * atlas.height * 4) {
      throw new Error("River static local modifier atlas dimensions are invalid.");
    }
    this.pixelBuffer = atlas.pixels.toTypedArray();
    this.tileProviders = Object.freeze(
      atlas.tiles.map((_tile, tileIndex) => new RiverStaticLocalModifierTileProvider(this, tileIndex))
    );
  }

  createBindings(bodyId: string, basePriority = 0): readonly WaterLocalModifierBinding[] {
    if (!bodyId || !Number.isFinite(basePriority)) {
      throw new Error("River static local modifier binding options are invalid.");
    }
    return Object.freeze(
      this.atlas.tiles.map((tile, tileIndex) =>
        Object.freeze({
          modifier: Object.freeze({
            id: `river-static-${tile.id}`,
            bodyId,
            bounds: Object.freeze({ minX: tile.min[0], minZ: tile.min[1], maxX: tile.max[0], maxZ: tile.max[1] }),
            channels: WaterLocalModifierChannel.CurrentLarge | WaterLocalModifierChannel.FoamSource,
            priority: basePriority + (tile.kind === RiverLocalMapRegionKind.Confluence ? 1 : 0),
            blendMode: WaterLocalModifierBlendMode.Max,
            dynamic: false
          }),
          provider: this.tileProviders[tileIndex]
        })
      )
    );
  }

  sampleChannel(u: number, v: number, channel: 0 | 1 | 2 | 3): number {
    const pixelX = clamp(u * this.atlas.width - 0.5, 0, this.atlas.width - 1);
    const pixelY = clamp(v * this.atlas.height - 0.5, 0, this.atlas.height - 1);
    const x0 = Math.floor(pixelX);
    const y0 = Math.floor(pixelY);
    const x1 = Math.min(this.atlas.width - 1, x0 + 1);
    const y1 = Math.min(this.atlas.height - 1, y0 + 1);
    const tx = pixelX - x0;
    const ty = pixelY - y0;
    const topLeft = this.pixelBuffer[(y0 * this.atlas.width + x0) * 4 + channel] / 255;
    const topRight = this.pixelBuffer[(y0 * this.atlas.width + x1) * 4 + channel] / 255;
    const bottomLeft = this.pixelBuffer[(y1 * this.atlas.width + x0) * 4 + channel] / 255;
    const bottomRight = this.pixelBuffer[(y1 * this.atlas.width + x1) * 4 + channel] / 255;
    const top = topLeft + (topRight - topLeft) * tx;
    const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;
    return top + (bottom - top) * ty;
  }

  getTile(index: number): RiverLocalMapTileData | undefined {
    return this.atlas.tiles[index];
  }
}
