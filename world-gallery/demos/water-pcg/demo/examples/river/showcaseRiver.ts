/**
 * Canonical River showcase.
 *
 * One deterministic network combines the former high-difference S bend and
 * Y-confluence examples. It deliberately stays inside the existing V2 authoring
 * contract so the showcase exercises the production compiler rather than a
 * presentation-only mesh.
 */
import {
  RiverDirectionMode,
  RiverDisturbanceKind,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel
} from "../../../authoring/river/RiverAuthoringEnums";
import { RIVER_MATERIAL_PRESET_CONFIG, RIVER_QUALITY_PRESET } from "../../../authoring/river/RiverAuthoringLimits";
import { WaterDecorationStyle } from "../../decoration/constants";
import { WaterPreviewMode } from "../constants";
import type { RiverPcgExample } from "../types";
import { CURVED_MAIN_RIVER_MATERIAL_TUNING, CURVED_MAIN_RIVER_SURFACE_MOTION } from "./constants";

const highQuality = RIVER_QUALITY_PRESET[RiverQualityLevel.High];

export const showcaseRiverExample: RiverPcgExample = {
  id: "showcase-river",
  label: "河流 Showcase",
  initialMode: WaterPreviewMode.River,
  decorationStyle: WaterDecorationStyle.HeightfieldRiver,
  view: {
    cameraPosition: [50, 18, 49],
    cameraTarget: [-5, 4.2, 0],
    backgroundColor: [0.035, 0.075, 0.085, 1],
    showWorldAxes: false
  },
  riverDescriptor: {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: "showcase-river-network",
    nodes: [
      {
        id: "showcase-main-source",
        kind: RiverNodeKind.Source,
        position: [-48, 12, -30],
        elevation: 12
      },
      {
        id: "showcase-tributary-source",
        kind: RiverNodeKind.Source,
        position: [-45, 8.2, 29],
        elevation: 8.2
      },
      {
        id: "showcase-confluence",
        kind: RiverNodeKind.Confluence,
        position: [-13, 4.1, -4],
        mergeRadius: 6.8,
        elevation: 4.1
      },
      {
        id: "showcase-mouth",
        kind: RiverNodeKind.Mouth,
        position: [48, 0, 30],
        elevation: 0
      }
    ],
    segments: [
      {
        id: "showcase-main-upper",
        from: "showcase-main-source",
        to: "showcase-confluence",
        order: 3,
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: highQuality.segmentLength,
          points: [
            {
              id: "showcase-main-source-point",
              position: [-48, 12, -30],
              out: [7, -1, 6],
              width: 5.4,
              depth: 1.05,
              flowSpeed: 2.45,
              bankFeather: 1.1
            },
            {
              id: "showcase-main-upper-bend-a",
              position: [-35, 9.6, -13],
              in: [-6, 0.9, -6],
              out: [5.5, -0.8, 4],
              width: 6.2,
              depth: 1.2,
              flowSpeed: 2.2,
              bankFeather: 1.35
            },
            {
              id: "showcase-main-upper-bend-b",
              position: [-25, 7.2, -20],
              in: [-5, 0.8, 3.5],
              out: [5.5, -0.75, 5.5],
              width: 6.8,
              depth: 1.35,
              flowSpeed: 2,
              bankFeather: 1.55
            },
            {
              id: "showcase-main-upper-bend-c",
              position: [-19, 5.5, -9],
              in: [-4.5, 0.7, -5],
              out: [3.8, -0.55, 3.5],
              width: 7.4,
              depth: 1.5,
              flowSpeed: 1.75,
              bankFeather: 1.85
            },
            {
              id: "showcase-main-confluence-point",
              position: [-13, 4.1, -4],
              in: [-4.5, 0.45, -3.5],
              width: 8,
              depth: 1.7,
              flowSpeed: 1.5,
              bankFeather: 2.2
            }
          ]
        }
      },
      {
        id: "showcase-tributary",
        from: "showcase-tributary-source",
        to: "showcase-confluence",
        order: 1,
        shape: {
          width: 4.2,
          depth: 0.9,
          bankFeather: 1.2
        },
        flow: {
          speed: 1.8,
          directionMode: RiverDirectionMode.PathOrder
        },
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: highQuality.segmentLength,
          points: [
            {
              id: "showcase-tributary-source-point",
              position: [-45, 8.2, 29],
              out: [6, -0.8, -7],
              width: 3.5,
              depth: 0.72,
              flowSpeed: 2.05,
              bankFeather: 0.95
            },
            {
              id: "showcase-tributary-bend-a",
              position: [-33, 6.8, 14],
              in: [-5, 0.6, 6],
              out: [5.2, -0.55, 2.5],
              width: 4,
              depth: 0.82,
              flowSpeed: 1.85,
              bankFeather: 1.05
            },
            {
              id: "showcase-tributary-bend-b",
              position: [-26, 5.5, 18],
              in: [-4, 0.5, -2],
              out: [5.5, -0.55, -6],
              width: 4.5,
              depth: 0.95,
              flowSpeed: 1.7,
              bankFeather: 1.2
            },
            {
              id: "showcase-tributary-mouth",
              position: [-13, 4.1, -4],
              in: [-5, 0.45, 6],
              width: 5.3,
              depth: 1.1,
              flowSpeed: 1.42,
              bankFeather: 1.55
            }
          ]
        }
      },
      {
        id: "showcase-main-lower",
        from: "showcase-confluence",
        to: "showcase-mouth",
        order: 4,
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: highQuality.segmentLength,
          points: [
            {
              id: "showcase-main-lower-start",
              position: [-13, 4.1, -4],
              out: [7.5, -0.5, 4],
              width: 8.4,
              depth: 1.75,
              flowSpeed: 1.45,
              bankFeather: 2.2
            },
            {
              id: "showcase-main-lower-bend-a",
              position: [3, 3.1, 5],
              in: [-6.5, 0.45, -4],
              out: [6.5, -0.45, -3.5],
              width: 8.9,
              depth: 1.85,
              flowSpeed: 1.32,
              bankFeather: 2.35
            },
            {
              id: "showcase-main-lower-bend-b",
              position: [18, 2.05, -1],
              in: [-6.5, 0.45, 3],
              out: [6.5, -0.4, 4.5],
              width: 9.5,
              depth: 2,
              flowSpeed: 1.2,
              bankFeather: 2.55
            },
            {
              id: "showcase-main-lower-bend-c",
              position: [33, 1, 14],
              in: [-6, 0.4, -5.5],
              out: [6, -0.35, 5],
              width: 10.2,
              depth: 2.15,
              flowSpeed: 1.05,
              bankFeather: 2.75
            },
            {
              id: "showcase-main-mouth-point",
              position: [48, 0, 30],
              in: [-6, 0.35, -5.5],
              width: 11,
              depth: 2.3,
              flowSpeed: 0.92,
              bankFeather: 3
            }
          ]
        }
      }
    ],
    disturbances: [
      {
        id: "showcase-main-cascade-rock",
        kind: RiverDisturbanceKind.Obstacle,
        position: [-30, 8.4, -16],
        radius: 1.15,
        strength: 1.2
      },
      {
        id: "showcase-tributary-rock",
        kind: RiverDisturbanceKind.Obstacle,
        position: [-28, 5.8, 16],
        radius: 0.85,
        strength: 1
      },
      {
        id: "showcase-confluence-rock",
        kind: RiverDisturbanceKind.Obstacle,
        position: [-10, 3.9, -2],
        radius: 1.35,
        strength: 1.35
      },
      {
        id: "showcase-lower-bend-rock",
        kind: RiverDisturbanceKind.Obstacle,
        position: [20, 1.9, 1],
        radius: 1.5,
        strength: 1.15
      }
    ],
    defaults: {
      shape: {
        width: 7.4,
        depth: 1.55,
        bankFeather: 1.9
      },
      flow: {
        speed: 1.65,
        directionMode: RiverDirectionMode.PathOrder
      },
      material: {
        preset: RiverMaterialPreset.MountainCreek,
        ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.MountainCreek],
        ...CURVED_MAIN_RIVER_MATERIAL_TUNING,
        baseColor: "#087783",
        foamIntensity: 0.9,
        clarity: 0.92
      },
      surfaceMotion: {
        ...CURVED_MAIN_RIVER_SURFACE_MOTION,
        seed: 39157,
        displacementAmplitude: 0.21,
        turbulence: 0.7,
        crestIntensity: 1.05,
        microNormalStrength: 1.42
      },
      quality: {
        geometry: {
          level: RiverQualityLevel.High,
          maxSegmentCount: highQuality.maxSegmentCount,
          maxChordError: highQuality.maxChordError
        },
        material: { level: RiverQualityLevel.High },
        maps: { level: RiverQualityLevel.High },
        query: { level: RiverQualityLevel.High }
      }
    }
  },
  riverDebug: {
    queryT: 0.56
  }
};
