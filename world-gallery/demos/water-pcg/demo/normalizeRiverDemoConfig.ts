/** Demo-only normalization that keeps preview state out of authoring/compiler data. */
import { normalizeRiverConfig } from "../authoring/river/RiverSchemaDecoder";
import { RiverNetworkSchemaVersion } from "../authoring/river/RiverAuthoringEnums";
import type { RiverNetworkDescriptor, RiverSegmentConfig } from "../authoring/river/RiverDescriptor";
import type { RiverDemoConfig } from "./types";

export function normalizeRiverDemoConfig(config: RiverDemoConfig): RiverDemoConfig {
  const authoring = normalizeRiverConfig(config);
  return {
    ...authoring,
    debug: {
      ...config.debug,
      queryT: Math.min(1, Math.max(0, config.debug.queryT))
    }
  };
}

export function createRiverDemoDescriptor(
  source: RiverNetworkDescriptor,
  configs: readonly RiverDemoConfig[]
): RiverNetworkDescriptor {
  const normalized = configs.map(normalizeRiverDemoConfig);
  const primary = normalized[0];
  const quality = primary
    ? {
        geometry: { ...primary.quality.geometry },
        material: { ...primary.quality.material },
        maps: { ...primary.quality.maps },
        query: { ...primary.quality.query }
      }
    : source.defaults.quality;
  const segments: RiverSegmentConfig[] = source.segments.map((segment, index) => {
    const config = normalized[index];
    if (!config) return segment;
    return {
      ...segment,
      curve: {
        mode: config.path.mode,
        segmentLength: config.path.segmentLength,
        points: config.path.points.map((point) => ({
          ...point,
          position: [point.position[0], point.position[1], point.position[2]],
          in: point.in ? [point.in[0], point.in[1], point.in[2]] : undefined,
          out: point.out ? [point.out[0], point.out[1], point.out[2]] : undefined
        }))
      },
      shape: { ...config.shape },
      flow: { ...config.flow },
      material: { ...config.material }
    };
  });
  return source.schemaVersion === RiverNetworkSchemaVersion.V2
    ? {
        ...source,
        schemaVersion: RiverNetworkSchemaVersion.V2,
        defaults: { ...source.defaults, quality, surfaceMotion: source.defaults.surfaceMotion },
        segments
      }
    : {
        ...source,
        schemaVersion: RiverNetworkSchemaVersion.V1,
        defaults: { ...source.defaults, quality },
        segments
      };
}
