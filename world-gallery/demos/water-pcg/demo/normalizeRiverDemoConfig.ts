/** Demo-only normalization that keeps preview state out of authoring/compiler data. */
import { normalizeRiverConfig } from "../authoring/river/RiverSchemaDecoder";
import type { RiverNetworkDescriptor } from "../authoring/river/RiverDescriptor";
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
  return {
    ...source,
    defaults: {
      ...source.defaults,
      quality: primary
        ? {
            geometry: { ...primary.quality.geometry },
            material: { ...primary.quality.material },
            maps: { ...primary.quality.maps },
            query: { ...primary.quality.query }
          }
        : source.defaults.quality
    },
    segments: source.segments.map((segment, index) => {
      const config = normalized[index];
      if (!config) return segment;
      return {
        ...segment,
        curve: {
          mode: config.path.mode,
          segmentLength: config.path.segmentLength,
          points: config.path.points.map((point) => ({
            ...point,
            position: [...point.position],
            in: point.in ? [...point.in] : undefined,
            out: point.out ? [...point.out] : undefined
          }))
        },
        shape: { ...config.shape },
        flow: { ...config.flow },
        material: { ...config.material }
      };
    })
  };
}
