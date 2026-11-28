import type { WaterTerrainSnapshot } from "../terrain/WaterTerrainSnapshot";
import {
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel
} from "./RiverAuthoringEnums";
import { RIVER_MATERIAL_PRESET_CONFIG, RIVER_QUALITY_PRESET } from "./RiverAuthoringLimits";
import type { RiverPathControlPoint, RiverDisturbanceSource } from "./RiverAuthoringTypes";
import type { RiverNetworkDescriptorV2 } from "./RiverDescriptor";

/** A single river needs only a downhill centerline. Terrain owns the supplied elevations. */
export interface RiverOptions {
  id: string;
  points: readonly RiverPathControlPoint[];
  width?: number;
  /** Profile fallback without external terrain; actual depth comes from terrain when supplied. */
  depth?: number;
  terrain?: WaterTerrainSnapshot;
  speed?: number;
  obstacles?: readonly RiverDisturbanceSource[];
}

/** Produces the production descriptor: the compiler still validates, chunks and creates query/terrain fields. */
export function createRiver(options: RiverOptions): RiverNetworkDescriptorV2 {
  if (options.points.length < 2) throw new Error("A river requires at least two centerline points.");
  const quality = RiverQualityLevel.High;
  const preset = RIVER_QUALITY_PRESET[quality];
  const points = options.points.map((point) => ({
    ...point,
    position: [...point.position] as [number, number, number]
  }));
  const source = `${options.id}-source`;
  const mouth = `${options.id}-mouth`;
  return {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: options.id,
    surfaceAuthority: "external-resolved",
    terrain: options.terrain,
    nodes: [
      { id: source, kind: RiverNodeKind.Source, position: [...points[0].position], elevation: points[0].position[1] },
      {
        id: mouth,
        kind: RiverNodeKind.Mouth,
        position: [...points.at(-1)!.position],
        elevation: points.at(-1)!.position[1]
      }
    ],
    segments: [
      {
        id: `${options.id}-reach`,
        from: source,
        to: mouth,
        curve: { mode: RiverPathMode.CatmullRom, segmentLength: preset.segmentLength, points }
      }
    ],
    disturbances: options.obstacles?.map((obstacle) => ({ ...obstacle, position: [...obstacle.position] })),
    defaults: {
      shape: { width: options.width ?? 8, depth: options.depth ?? 1.5, bankFeather: 1 },
      flow: { speed: options.speed ?? 1.5, directionMode: RiverDirectionMode.PathOrder },
      material: {
        preset: RiverMaterialPreset.MountainCreek,
        ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.MountainCreek]
      },
      surfaceMotion: {
        seed: 39157,
        displacementAmplitude: 0,
        displacementLengthScale: 1.2,
        shoreDampingWidth: 0.5,
        turbulence: 0
      },
      quality: {
        geometry: { level: quality, maxChordError: preset.maxChordError },
        material: { level: quality },
        maps: { level: quality },
        query: { level: quality }
      }
    }
  };
}
