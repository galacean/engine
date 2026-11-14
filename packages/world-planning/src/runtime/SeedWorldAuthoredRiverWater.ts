import { RIVER_MAX_WATER_SURFACE_SLOPE } from "@galacean/engine-water/water/compiler/index";
import {
  RiverDirectionMode,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel,
  RIVER_QUALITY_PRESET
} from "@galacean/engine-water/water/index";

import type { RiverNetworkDescriptor } from "@galacean/engine-water/water/index";
import { PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1 } from "@galacean/engine-water/water/presets/river/index";
import {
  resolveSeedWorldAuthoredRiverCenterlineV1,
  seedWorldAuthoredRiverBoundsV1
} from "@galacean/engine-water/world/SeedWorldAuthoredRiverGeometry";
import type { SeedWorldRiverV1 } from "../world/SeedWorldWorldEdit.ts";
import type { SeedWorldAuthoredWaterQueryBodyV1 } from "@galacean/engine-water/world/SeedWorldAuthoredWaterQuery";

// Leave a 10% margin below the shared compiler warning threshold. Decimal rounding
// retains the previous exact 0.18 value rather than the extra binary ulp in 0.2 * 0.9.
const MAX_AUTHORED_WATER_SURFACE_SLOPE = Number((RIVER_MAX_WATER_SURFACE_SLOPE * 0.9).toPrecision(15));

export interface SeedWorldAuthoredRiverWaterV1 {
  readonly descriptor: RiverNetworkDescriptor;
  readonly bodyOrigin: readonly [x: number, z: number];
  readonly logicalBounds: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  readonly queryBody: Extract<SeedWorldAuthoredWaterQueryBodyV1, { kind: "river" }>;
}

/** Projects persistent River authoring into the shared Water descriptor contract. */
export function createSeedWorldAuthoredRiverWaterV1(
  river: Readonly<SeedWorldRiverV1>,
  sizeMetres: number,
  sampleTerrainHeight: (x: number, z: number) => number | undefined
): Readonly<SeedWorldAuthoredRiverWaterV1> {
  const centerline = resolveSeedWorldAuthoredRiverCenterlineV1(river, sizeMetres);
  const bodyOrigin = Object.freeze([centerline[0]!.x, centerline[0]!.z] as const);
  const depth = river.depthMillimetres / 1_000;
  const width = river.widthMillimetres / 1_000;
  const flowSpeed = river.flowSpeedMillimetresPerSecond / 1_000;
  const bankFeather = Math.min(10, Math.max(1, width));
  let previousSurface: number | undefined;
  const points = centerline.map((point, index) => {
    const terrainHeight = sampleTerrainHeight(point.x, point.z);
    if (terrainHeight === undefined) throw new RangeError(`River '${river.riverId}' leaves the world boundary.`);
    const rawSurface = terrainHeight + depth * 0.85;
    const previousPoint = centerline[index - 1];
    const distance = previousPoint ? Math.hypot(point.x - previousPoint.x, point.z - previousPoint.z) : 0;
    const surface =
      previousSurface === undefined
        ? rawSurface
        : Math.min(
            previousSurface,
            Math.max(previousSurface - distance * MAX_AUTHORED_WATER_SURFACE_SLOPE, rawSurface)
          );
    previousSurface = surface;
    return {
      id: `${river.riverId}-point-${index}`,
      position: [point.x - bodyOrigin[0], surface, point.z - bodyOrigin[1]] as [number, number, number],
      width,
      depth,
      flowSpeed,
      bankFeather
    };
  });
  const sourceId = `${river.riverId}-source`;
  const mouthId = `${river.riverId}-mouth`;
  const quality = RIVER_QUALITY_PRESET[RiverQualityLevel.High];
  const profile = PROMPT_NOISE_CLEAR_STREAM_HIGH_PROFILE_V1;
  const descriptor: RiverNetworkDescriptor = {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: river.riverId,
    surfaceAuthority: "external-resolved",
    nodes: [
      {
        id: sourceId,
        kind: RiverNodeKind.Source,
        position: points[0]!.position,
        elevation: points[0]!.position[1]
      },
      {
        id: mouthId,
        kind: RiverNodeKind.Mouth,
        position: points.at(-1)!.position,
        elevation: points.at(-1)!.position[1]
      }
    ],
    segments: [
      {
        id: `${river.riverId}-reach`,
        from: sourceId,
        to: mouthId,
        order: 0,
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: quality.segmentLength,
          points
        }
      }
    ],
    defaults: {
      shape: { width, depth, bankFeather },
      flow: { speed: flowSpeed, directionMode: RiverDirectionMode.PathOrder },
      material: profile.descriptorV2.material,
      quality: {
        geometry: {
          level: RiverQualityLevel.High,
          maxChordError: quality.maxChordError
        },
        material: { level: RiverQualityLevel.High },
        maps: { level: RiverQualityLevel.High },
        query: { level: RiverQualityLevel.High }
      },
      surfaceMotion: profile.descriptorV2.surfaceMotion
    }
  };
  const bounds = seedWorldAuthoredRiverBoundsV1(river, sizeMetres);
  return Object.freeze({
    descriptor,
    bodyOrigin,
    logicalBounds: Object.freeze({
      minX: bounds.minimumX,
      minZ: bounds.minimumZ,
      maxX: bounds.maximumX,
      maxZ: bounds.maximumZ
    }),
    queryBody: Object.freeze({
      kind: "river",
      points: Object.freeze(
        points.map((point) =>
          Object.freeze({
            x: point.position[0] + bodyOrigin[0],
            z: point.position[2] + bodyOrigin[1],
            surfaceElevationMetres: point.position[1],
            widthMetres: point.width
          })
        )
      )
    })
  });
}
