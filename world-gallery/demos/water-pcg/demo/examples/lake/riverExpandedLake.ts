/**
 * River-expanded lake example.
 *
 * The current water system has no dedicated lake polygon or shoreline compiler.
 * This fixture deliberately reuses the stable River descriptor: a nearly level
 * reach widens into a calm basin, then narrows back into an outlet. It validates
 * the lake-like scene that current River width/depth/flow authoring can express
 * without introducing a premature River/Lake runtime abstraction.
 */
import {
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel
} from "../../../authoring/river/RiverAuthoringEnums";
import { WaterDecorationStyle } from "../../decoration/constants";
import { WaterPreviewMode } from "../constants";
import type { RiverPcgExample } from "../types";

export const riverExpandedLakeExample: RiverPcgExample = {
  id: "river-expanded-lake",
  label: "河流扩宽湖泊",
  initialMode: WaterPreviewMode.River,
  decorationStyle: WaterDecorationStyle.Lake,
  view: {
    cameraPosition: [0, 72, 78],
    cameraTarget: [0, 0, 2],
    backgroundColor: [0.05, 0.08, 0.08, 1]
  },
  riverDescriptor: {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: "river-expanded-lake-network",
    nodes: [
      {
        id: "lake-inlet",
        kind: RiverNodeKind.Source,
        position: [-52, 0.36, -8],
        elevation: 0.4
      },
      {
        id: "lake-outlet",
        kind: RiverNodeKind.Mouth,
        position: [52, 0.2, 12],
        elevation: 0.2
      }
    ],
    segments: [
      {
        id: "lake-basin",
        from: "lake-inlet",
        to: "lake-outlet",
        order: 2,
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: 1.8,
          points: [
            {
              id: "lake-inlet-point",
              position: [-52, 0.36, -8],
              out: [7, -0.02, 2],
              width: 5,
              depth: 1.2,
              flowSpeed: 0.72,
              bankFeather: 1.2
            },
            {
              id: "lake-inlet-transition",
              position: [-34, 0.34, -4],
              in: [-6, 0.02, -2],
              out: [5, -0.01, 1],
              width: 8,
              depth: 1.8,
              flowSpeed: 0.48,
              bankFeather: 2
            },
            {
              id: "lake-west-shore",
              position: [-26, 0.32, -2],
              in: [-4, 0.01, -1],
              out: [3, -0.01, 0.5],
              width: 12,
              depth: 2.2,
              flowSpeed: 0.34,
              bankFeather: 2.8
            },
            {
              id: "lake-west-arc",
              position: [-22, 0.31, -1],
              in: [-2, 0.01, -0.5],
              out: [3, -0.01, 0.5],
              width: 24,
              depth: 3.1,
              flowSpeed: 0.23,
              bankFeather: 4
            },
            {
              id: "lake-west-inner",
              position: [-16, 0.3, 0],
              in: [-3, 0.01, -0.5],
              out: [4, -0.01, 0.5],
              width: 38,
              depth: 4,
              flowSpeed: 0.16,
              bankFeather: 5
            },
            {
              id: "lake-west-center",
              position: [-8, 0.29, 1],
              in: [-4, 0.01, -0.5],
              out: [4, -0.01, 0.4],
              width: 47,
              depth: 4.5,
              flowSpeed: 0.12,
              bankFeather: 5.8
            },
            {
              id: "lake-center",
              position: [0, 0.28, 1.5],
              in: [-4, 0.01, -0.4],
              out: [4, -0.01, 0.2],
              width: 50,
              depth: 4.8,
              flowSpeed: 0.1,
              bankFeather: 6
            },
            {
              id: "lake-east-center",
              position: [8, 0.27, 1.8],
              in: [-4, 0.01, -0.2],
              out: [4, -0.01, 0.5],
              width: 47,
              depth: 4.5,
              flowSpeed: 0.12,
              bankFeather: 5.8
            },
            {
              id: "lake-east-inner",
              position: [16, 0.25, 2.6],
              in: [-4, 0.01, -0.5],
              out: [3, -0.01, 0.5],
              width: 38,
              depth: 4,
              flowSpeed: 0.16,
              bankFeather: 5
            },
            {
              id: "lake-east-arc",
              position: [22, 0.24, 3.6],
              in: [-3, 0.01, -0.5],
              out: [2, -0.01, 0.5],
              width: 24,
              depth: 3.1,
              flowSpeed: 0.23,
              bankFeather: 4
            },
            {
              id: "lake-east-shore",
              position: [26, 0.23, 4.5],
              in: [-2, 0.01, -0.5],
              out: [4, -0.01, 1],
              width: 12,
              depth: 2.2,
              flowSpeed: 0.34,
              bankFeather: 2.8
            },
            {
              id: "lake-outlet-transition",
              position: [34, 0.22, 7],
              in: [-4, 0.01, -1],
              out: [6, -0.02, 2],
              width: 8,
              depth: 1.8,
              flowSpeed: 0.48,
              bankFeather: 2
            },
            {
              id: "lake-outlet-point",
              position: [52, 0.2, 12],
              in: [-7, 0.02, -2],
              width: 5,
              depth: 1.2,
              flowSpeed: 0.78,
              bankFeather: 1.2
            }
          ]
        }
      }
    ],
    defaults: {
      shape: {
        width: 26,
        depth: 3.6,
        bankFeather: 4.5
      },
      flow: {
        speed: 0.2,
        directionMode: RiverDirectionMode.PathOrder
      },
      material: {
        preset: RiverMaterialPreset.ClearStream,
        baseColor: "#176f83",
        foamColor: "#d9f1e8",
        foamIntensity: 0.28,
        clarity: 0.74
      },
      surfaceMotion: {
        seed: 41327,
        displacementAmplitude: 0.1,
        displacementLengthScale: 13,
        shoreDampingWidth: 3.4,
        turbulence: 0.32,
        crestIntensity: 0.24,
        microNormalStrength: 0.2
      },
      quality: {
        geometry: { level: RiverQualityLevel.Medium, maxSegmentCount: 512, maxChordError: 0.25 },
        material: { level: RiverQualityLevel.Medium },
        maps: { level: RiverQualityLevel.Medium },
        query: { level: RiverQualityLevel.Medium }
      }
    }
  },
  riverDebug: {
    queryT: 0.5
  }
};
