import type { Texture2D } from "@galacean/engine-core";
import type { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";
import { OceanNearshoreOutsidePolicy } from "../../authoring/ocean/OceanNearshoreTypes";
import type { OceanNearshoreStateTextureService } from "./OceanNearshoreStateTextureService";

export enum OceanNearshoreDebugView {
  Final = 0,
  Depth = 1,
  ShoreDistance = 2,
  WetMask = 3,
  OutsidePolicy = 4,
  Breaker = 5,
  ThinFilm = 6,
  Wetness = 7
}

export interface OceanNearshoreDynamicBinding {
  readonly stateTexture: Texture2D;
  readonly wetnessTexture: Texture2D;
  /** Minimum/maximum film surface height, maximum swash speed, occupancy threshold. */
  readonly decode: readonly [number, number, number, number];
}

export interface OceanNearshoreStaticBinding {
  readonly texture: Texture2D;
  readonly worldToUv: readonly [number, number, number, number];
  readonly decode: readonly [number, number, number, number];
  /** Inverse width/height followed by X/Z cell size in metres. */
  readonly grid: readonly [number, number, number, number];
  /** Deep ocean = 1, dry = 0 in negativeX/positiveX/negativeZ/positiveZ order. */
  readonly outsidePolicy: readonly [number, number, number, number];
  readonly debugView: OceanNearshoreDebugView;
  readonly waveEnabled: boolean;
  readonly dynamic?: Readonly<OceanNearshoreDynamicBinding>;
}

function encodeOutsidePolicy(policy: OceanNearshoreOutsidePolicy): 0 | 1 {
  return policy === OceanNearshoreOutsidePolicy.DeepOcean ? 1 : 0;
}

export function createOceanNearshoreStaticBinding(
  resource: OceanNearshoreFieldResource,
  texture: Texture2D,
  debugView = OceanNearshoreDebugView.Final
): Readonly<OceanNearshoreStaticBinding> {
  const data = resource.data;
  const atlas = data.staticAtlas;
  return Object.freeze({
    texture,
    worldToUv: atlas.worldToUv,
    decode: Object.freeze([
      atlas.currentDecodeScale,
      atlas.maximumDepth,
      atlas.shoreDistanceRange,
      (atlas.wetShoreDistanceCode - 0.5) / 255
    ] as const),
    grid: Object.freeze([
      1 / atlas.width,
      1 / atlas.height,
      data.grid.cellSizeXZ[0],
      data.grid.cellSizeXZ[1]
    ] as const),
    outsidePolicy: Object.freeze([
      encodeOutsidePolicy(data.outsidePolicy.negativeX),
      encodeOutsidePolicy(data.outsidePolicy.positiveX),
      encodeOutsidePolicy(data.outsidePolicy.negativeZ),
      encodeOutsidePolicy(data.outsidePolicy.positiveZ)
    ] as const),
    debugView,
    waveEnabled: true
  });
}

export function attachOceanNearshoreDynamicBinding(
  staticBinding: Readonly<OceanNearshoreStaticBinding>,
  service: OceanNearshoreStateTextureService,
  waveEnabled = true
): Readonly<OceanNearshoreStaticBinding> {
  return Object.freeze({
    ...staticBinding,
    waveEnabled,
    dynamic: Object.freeze({
      stateTexture: service.stateTexture,
      wetnessTexture: service.wetnessTexture,
      decode: Object.freeze([
        service.field.surfaceHeightDecode[0],
        service.field.surfaceHeightDecode[1],
        service.field.maximumSwashSpeed,
        0.5
      ] as const)
    })
  });
}
