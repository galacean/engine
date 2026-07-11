/**
 * Multi-tributary river-network example.
 *
 * This fixture demonstrates the new RiverNetworkConfig shape with several
 * directed river segments feeding two confluence nodes. The current renderer draws
 * each segment independently; junction patch generation can be layered on top of
 * this data model later without changing the authoring format.
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

export const multiTributaryRiverExample: WaterPcgExample = {
  id: "multi-tributary-river",
  label: "多支流河网",
  initialMode: WaterPreviewMode.River,
  ocean: {
    size: 96,
    resolution: 72,
    waterLevel: -0.05,
    waveAmplitude: 0.36,
    waveLength: 14,
    waveSpeed: 0.72,
    alpha: 0.68,
    foamIntensity: 1.25,
    oceanColor: "#207f9b"
  },
  riverNetwork: {
    id: "multi-tributary-network",
    nodes: [
      {
        id: "main-source",
        kind: RiverNodeKind.Source,
        position: [-48, 0.35, -26],
        elevation: 0.35
      },
      {
        id: "north-tributary-source",
        kind: RiverNodeKind.Source,
        position: [-44, 0.26, 28],
        elevation: 0.26
      },
      {
        id: "south-tributary-source",
        kind: RiverNodeKind.Source,
        position: [-34, 0.22, -42],
        elevation: 0.22
      },
      {
        id: "east-tributary-source",
        kind: RiverNodeKind.Source,
        position: [4, 0.16, -36],
        elevation: 0.16
      },
      {
        id: "upper-confluence",
        kind: RiverNodeKind.Confluence,
        position: [-14, 0.08, -6],
        mergeRadius: 6,
        elevation: 0.08
      },
      {
        id: "lower-confluence",
        kind: RiverNodeKind.Confluence,
        position: [18, 0.0, 10],
        mergeRadius: 7,
        elevation: 0
      },
      {
        id: "main-mouth",
        kind: RiverNodeKind.Mouth,
        position: [48, -0.08, 30],
        elevation: -0.08
      }
    ],
    segments: [
      {
        id: "main-upper",
        from: "main-source",
        to: "upper-confluence",
        order: 3,
        curve: {
          mode: RiverPathMode.Bezier,
          segmentLength: 1.7,
          points: [
            {
              id: "main-upper-source",
              position: [-48, 0.35, -26],
              out: [8, -0.08, 5],
              width: 5.2,
              depth: 1.0,
              flowSpeed: 1.8,
              bankFeather: 1.2
            },
            {
              id: "main-upper-bend",
              position: [-30, 0.18, -14],
              in: [-7, 0.05, -4],
              out: [7, -0.04, 3.5],
              width: 6.1,
              depth: 1.15,
              flowSpeed: 1.55,
              bankFeather: 1.45
            },
            {
              id: "main-upper-confluence",
              position: [-14, 0.08, -6],
              in: [-6, 0.03, -3],
              width: 7.4,
              depth: 1.45,
              flowSpeed: 1.32,
              bankFeather: 2.1
            }
          ]
        }
      },
      {
        id: "north-tributary",
        from: "north-tributary-source",
        to: "upper-confluence",
        order: 1,
        shape: {
          width: 3.8,
          depth: 0.8,
          bankFeather: 1.1
        },
        flow: {
          speed: 1.65,
          directionMode: RiverDirectionMode.PathOrder
        },
        curve: {
          mode: RiverPathMode.Bezier,
          segmentLength: 1.6,
          points: [
            {
              id: "north-tributary-source-point",
              position: [-44, 0.26, 28],
              out: [7, -0.04, -7],
              width: 3.2,
              depth: 0.62,
              flowSpeed: 1.75,
              bankFeather: 0.9
            },
            {
              id: "north-tributary-bend",
              position: [-29, 0.15, 13],
              in: [-6, 0.03, 5],
              out: [7, -0.03, -6],
              width: 3.8,
              depth: 0.75,
              flowSpeed: 1.6,
              bankFeather: 1.0
            },
            {
              id: "north-tributary-mouth",
              position: [-14, 0.08, -6],
              in: [-5, 0.02, 5],
              width: 4.5,
              depth: 0.9,
              flowSpeed: 1.35,
              bankFeather: 1.35
            }
          ]
        }
      },
      {
        id: "main-middle",
        from: "upper-confluence",
        to: "lower-confluence",
        order: 4,
        curve: {
          mode: RiverPathMode.Bezier,
          segmentLength: 1.7,
          points: [
            {
              id: "main-middle-start",
              position: [-14, 0.08, -6],
              out: [8, -0.03, 1],
              width: 7.6,
              depth: 1.55,
              flowSpeed: 1.28,
              bankFeather: 2.0
            },
            {
              id: "main-middle-bend",
              position: [2, 0.04, 0],
              in: [-6, 0.02, -1.5],
              out: [6, -0.02, 4],
              width: 8.0,
              depth: 1.65,
              flowSpeed: 1.2,
              bankFeather: 2.1
            },
            {
              id: "main-middle-end",
              position: [18, 0.0, 10],
              in: [-6, 0.02, -4],
              width: 8.7,
              depth: 1.8,
              flowSpeed: 1.12,
              bankFeather: 2.4
            }
          ]
        }
      },
      {
        id: "south-tributary",
        from: "south-tributary-source",
        to: "lower-confluence",
        order: 1,
        shape: {
          width: 4.2,
          depth: 0.85,
          bankFeather: 1.15
        },
        curve: {
          mode: RiverPathMode.Bezier,
          segmentLength: 1.8,
          points: [
            {
              id: "south-tributary-source-point",
              position: [-34, 0.22, -42],
              out: [9, -0.04, 6],
              width: 3.4,
              depth: 0.65,
              flowSpeed: 1.9,
              bankFeather: 0.95
            },
            {
              id: "south-tributary-bend-a",
              position: [-16, 0.12, -28],
              in: [-7, 0.03, -4],
              out: [8, -0.04, 8],
              width: 3.9,
              depth: 0.75,
              flowSpeed: 1.7,
              bankFeather: 1.05
            },
            {
              id: "south-tributary-bend-b",
              position: [2, 0.05, -10],
              in: [-7, 0.03, -7],
              out: [7, -0.03, 7],
              width: 4.6,
              depth: 0.95,
              flowSpeed: 1.45,
              bankFeather: 1.3
            },
            {
              id: "south-tributary-mouth",
              position: [18, 0.0, 10],
              in: [-5, 0.02, -6],
              width: 5.2,
              depth: 1.05,
              flowSpeed: 1.25,
              bankFeather: 1.55
            }
          ]
        }
      },
      {
        id: "east-tributary",
        from: "east-tributary-source",
        to: "lower-confluence",
        order: 1,
        shape: {
          width: 3.4,
          depth: 0.7,
          bankFeather: 0.95
        },
        material: {
          preset: RiverMaterialPreset.MountainCreek,
          ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.MountainCreek]
        },
        curve: {
          mode: RiverPathMode.Bezier,
          segmentLength: 1.5,
          points: [
            {
              id: "east-tributary-source-point",
              position: [4, 0.16, -36],
              out: [5, -0.04, 7],
              width: 2.8,
              depth: 0.5,
              flowSpeed: 2.0,
              bankFeather: 0.7
            },
            {
              id: "east-tributary-bend",
              position: [12, 0.08, -16],
              in: [-4, 0.03, -6],
              out: [4, -0.03, 8],
              width: 3.2,
              depth: 0.62,
              flowSpeed: 1.7,
              bankFeather: 0.85
            },
            {
              id: "east-tributary-mouth",
              position: [18, 0.0, 10],
              in: [-3, 0.02, -7],
              width: 4.0,
              depth: 0.78,
              flowSpeed: 1.35,
              bankFeather: 1.1
            }
          ]
        }
      },
      {
        id: "main-lower",
        from: "lower-confluence",
        to: "main-mouth",
        order: 4,
        curve: {
          mode: RiverPathMode.Bezier,
          segmentLength: 1.7,
          points: [
            {
              id: "main-lower-start",
              position: [18, 0.0, 10],
              out: [8, -0.02, 3],
              width: 9.0,
              depth: 1.9,
              flowSpeed: 1.08,
              bankFeather: 2.5
            },
            {
              id: "main-lower-bend",
              position: [34, -0.04, 18],
              in: [-7, 0.02, -3],
              out: [6, -0.02, 5],
              width: 9.4,
              depth: 2.0,
              flowSpeed: 1.0,
              bankFeather: 2.6
            },
            {
              id: "main-lower-mouth",
              position: [48, -0.08, 30],
              in: [-5, 0.02, -5],
              width: 10.2,
              depth: 2.1,
              flowSpeed: 0.92,
              bankFeather: 2.8
            }
          ]
        }
      }
    ],
    defaults: {
      shape: {
        width: 6.8,
        depth: 1.35,
        bankFeather: 1.7
      },
      flow: {
        speed: 1.35,
        directionMode: RiverDirectionMode.PathOrder
      },
      material: {
        preset: RiverMaterialPreset.ClearStream,
        ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.ClearStream]
      },
      quality: {
        geometry: { level: RiverQualityLevel.Medium, maxSegmentCount: 1024, maxChordError: 0.25 },
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
