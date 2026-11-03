import {
  watercourseRiverTopology,
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel,
  type RiverNetworkDescriptor
} from "@galacean/engine-water/water/index";
import { cropWaterTerrainSnapshot } from "@galacean/engine-water/water/authoring/terrain/index";
import settings from "../planning-data/water-rendering.json";
import { RIVER_MATERIAL_PRESET_CONFIG } from "@galacean/engine-water/water/presets/river/index";

import type { IslandPlan } from "./IslandPlanModel";
import { planningWaterTerrainSnapshot } from "./PlanningHeightmap";
import { planningRiverEndCaps } from "./PlanningRiverEndCaps";

interface Section {
  x: number;
  y: number;
  z: number;
  width: number;
}
/** Planning water profiles remain the surface authority; canonical Terrain supplies bed depth. */
export function planningRiverDescriptors(plan: IslandPlan, ids?: ReadonlySet<string>): RiverNetworkDescriptor[] {
  const terrain = planningWaterTerrainSnapshot(plan);
  return plan.waters
    .filter((w) => w.kind === "river" && (!ids || ids.has(w.id)))
    .map((w) => {
      const profile = plan.planning?.profiles.find((p) => p.ownerId === w.id && p.kind === "water");
      if (!profile || profile.points.length < 2) throw new Error(`${w.label}缺少已发布水位剖面`);
      const points = profile.points.map((p, i) => ({
        ...p,
        width: w.widths?.[i] ?? w.widths?.at(-1) ?? profile.width
      }));
      const first = points[0],
        last = points.at(-1)!;
      const quality = settings.riverQuality as RiverQualityLevel;
      return planningRiverEndCaps(
        {
          id: w.id,
          schemaVersion: RiverNetworkSchemaVersion.V2,
          surfaceAuthority: "external-resolved",
          terrain: w.outline.length
            ? cropWaterTerrainSnapshot(terrain, [
                Math.min(...w.outline.map((p) => p.x)) - 2,
                Math.min(...w.outline.map((p) => p.z)) - 2,
                Math.max(...w.outline.map((p) => p.x)) + 2,
                Math.max(...w.outline.map((p) => p.z)) + 2
              ])
            : terrain,
          ...(w.course
            ? watercourseRiverTopology(w.course, settings.riverSegmentLengthM)
            : {
                nodes: [
                  {
                    id: w.id + ":source",
                    kind: RiverNodeKind.Source,
                    position: [first.x, first.y, first.z] as [number, number, number],
                    elevation: first.y
                  },
                  {
                    id: w.id + ":mouth",
                    kind: RiverNodeKind.Mouth,
                    position: [last.x, last.y, last.z] as [number, number, number],
                    elevation: last.y
                  }
                ],
                segments: [
                  {
                    id: w.id,
                    from: w.id + ":source",
                    to: w.id + ":mouth",
                    curve: {
                      semantics: "resolved-path" as const,
                      mode: RiverPathMode.Polyline,
                      segmentLength: settings.riverSegmentLengthM,
                      points: points.map((p, i) => ({
                        id: `${w.id}:${i}`,
                        position: [p.x, p.y, p.z] as [number, number, number],
                        width: p.width
                      }))
                    }
                  }
                ]
              }),
          defaults: {
            // Required legacy authoring field; ignored whenever terrain supplies the bed.
            shape: { width: first.width, depth: 1, bankFeather: settings.riverBankFeatherM },
            flow: { speed: w.flowSpeed ?? settings.riverFlowMps, directionMode: RiverDirectionMode.PathOrder },
            material: {
              preset: RiverMaterialPreset.ClearStream,
              ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.ClearStream]
            },
            surfaceMotion: {
              seed: Math.abs(plan.parameters.seed) % 65536,
              displacementAmplitude: settings.riverWaveAmplitudeM,
              displacementLengthScale: settings.riverWaveLengthM,
              shoreDampingWidth: settings.riverShoreDampingM,
              turbulence: settings.riverTurbulence
            },
            quality: {
              geometry: { level: quality, maxChordError: settings.profileErrorM },
              material: { level: quality },
              maps: { level: quality },
              query: { level: quality }
            }
          }
        },
        w.outline
      );
    });
}
