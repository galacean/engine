/**
 * Curved main-river example.
 *
 * This preserves the current water-pcg river scene as a standalone example file:
 * one Bezier-authored main channel, local width/depth/flow overrides on control
 * points, and the same ocean settings used by the original demo.
 */
import {
  RiverDebugMode,
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNodeKind,
  RiverPathMode,
  RiverPreviewStage,
  RIVER_MATERIAL_PRESET_CONFIG,
  RiverQualityLevel
} from "../river/constants";
import { WaterPreviewMode } from "./constants";
import { WaterPcgExample } from "./types";

export const curvedMainRiverExample: WaterPcgExample = {
  id: "curved-main-river",
  label: "曲线主河",
  initialMode: WaterPreviewMode.River,
  ocean: {
    size: 90,
    resolution: 72,
    waterLevel: 0,
    waveAmplitude: 0.45,
    waveLength: 12,
    waveSpeed: 0.85,
    alpha: 0.72,
    foamIntensity: 1.1,
    oceanColor: "#1c8fc7"
  },
  riverNetwork: {
    id: "demo-river-network",
    nodes: [
      {
        id: "main-source",
        kind: RiverNodeKind.Source,
        position: [-42, 0.2, -24],
        elevation: 0.2
      },
      {
        id: "main-mouth",
        kind: RiverNodeKind.Mouth,
        position: [42, -0.06, 26],
        elevation: -0.06
      }
    ],
    segments: [
      {
        id: "main-river",
        from: "main-source",
        to: "main-mouth",
        order: 3,
        curve: {
          mode: RiverPathMode.Bezier,
          segmentLength: 1.8,
          points: [
            {
              id: "main-source-point",
              position: [-42, 0.2, -24],
              out: [5.4, -0.08, 5.6],
              width: 5.6,
              depth: 1.0,
              flowSpeed: 1.8,
              bankFeather: 1.2
            },
            {
              id: "main-upper-bend",
              position: [-32, 0.05, -12],
              in: [-4.8, 0.08, -5.0],
              out: [5.8, 0.05, 4.4],
              width: 6.5,
              depth: 1.2,
              flowSpeed: 1.55,
              bankFeather: 1.55
            },
            {
              id: "main-mid-bend-a",
              position: [-18, 0.16, -3],
              in: [-5.8, -0.04, -3.4],
              out: [6.2, -0.05, 3.8],
              width: 7.2,
              depth: 1.4,
              flowSpeed: 1.35,
              bankFeather: 1.8
            },
            {
              id: "main-mid-bend-b",
              position: [-4, 0.02, 6],
              in: [-5.6, 0.04, -3.8],
              out: [6.4, 0.02, 1.8],
              width: 7.8,
              depth: 1.6,
              flowSpeed: 1.25,
              bankFeather: 2.0
            },
            {
              id: "main-lower-bend-a",
              position: [12, 0.1, 2],
              in: [-6.2, -0.02, 2.4],
              out: [6.0, -0.05, 3.6],
              width: 7.1,
              depth: 1.5,
              flowSpeed: 1.35,
              bankFeather: 1.85
            },
            {
              id: "main-lower-bend-b",
              position: [28, 0.0, 14],
              in: [-6.0, 0.04, -4.2],
              out: [5.2, -0.02, 5.0],
              width: 6.7,
              depth: 1.35,
              flowSpeed: 1.45,
              bankFeather: 1.65
            },
            {
              id: "main-mouth-point",
              position: [42, -0.06, 26],
              in: [-5.2, 0.02, -5.0],
              width: 8.4,
              depth: 1.8,
              flowSpeed: 1.15,
              bankFeather: 2.2
            }
          ]
        }
      }
    ],
    defaults: {
      shape: {
        width: 7,
        depth: 1.4,
        bankFeather: 1.8
      },
      flow: {
        speed: 1.4,
        directionMode: RiverDirectionMode.PathOrder
      },
      material: {
        preset: RiverMaterialPreset.ClearStream,
        ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.ClearStream]
      },
      quality: {
        geometry: { level: RiverQualityLevel.Medium, maxSegmentCount: 512, maxChordError: 0.25 },
        material: { level: RiverQualityLevel.Medium },
        maps: { level: RiverQualityLevel.Low },
        query: { level: RiverQualityLevel.Medium }
      }
    },
    debug: {
      previewStage: RiverPreviewStage.Full,
      mode: RiverDebugMode.Full,
      queryT: 0.52
    }
  }
};
