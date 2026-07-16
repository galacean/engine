/**
 * Indoor pool example based on the current River runtime.
 *
 * A straight, nearly level reach provides the rectangular water surface while
 * Demo-only pool fixtures supply the tiled basin, coping, deck, and ladder.
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
import { RiverDebugMode, RiverPreviewStage } from "../../debug/constants";
import { WaterPreviewMode } from "../constants";
import type { RiverPcgExample } from "../types";

export const indoorReflectivePoolExample: RiverPcgExample = {
  id: "indoor-reflective-pool",
  label: "室内泳池",
  initialMode: WaterPreviewMode.River,
  decorationStyle: WaterDecorationStyle.Pool,
  view: {
    cameraPosition: [40, 22, 40],
    cameraTarget: [0, -0.7, 0],
    backgroundColor: [0.76, 0.82, 0.83, 1]
  },
  riverDescriptor: {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: "indoor-reflective-pool-network",
    nodes: [
      {
        id: "pool-source",
        kind: RiverNodeKind.Source,
        position: [-32, 0.12, 0],
        elevation: 0.12
      },
      {
        id: "pool-mouth",
        kind: RiverNodeKind.Mouth,
        position: [32, 0.1, 0],
        elevation: 0.1
      }
    ],
    segments: [
      {
        id: "pool-water",
        from: "pool-source",
        to: "pool-mouth",
        order: 1,
        curve: {
          mode: RiverPathMode.Polyline,
          segmentLength: 1.4,
          points: [
            {
              id: "pool-left",
              position: [-32, 0.12, 0],
              width: 26,
              depth: 2.6,
              flowSpeed: 0.04,
              bankFeather: 0.15
            },
            {
              id: "pool-center",
              position: [0, 0.11, 0],
              width: 26,
              depth: 2.6,
              flowSpeed: 0.04,
              bankFeather: 0.15
            },
            {
              id: "pool-right",
              position: [32, 0.1, 0],
              width: 26,
              depth: 2.6,
              flowSpeed: 0.04,
              bankFeather: 0.15
            }
          ]
        }
      }
    ],
    defaults: {
      shape: {
        width: 26,
        depth: 2.6,
        bankFeather: 0.15
      },
      flow: {
        speed: 0.04,
        directionMode: RiverDirectionMode.PathOrder
      },
      material: {
        preset: RiverMaterialPreset.ClearStream,
        baseColor: "#0783a8",
        foamColor: "#f5ffff",
        foamIntensity: 0.02,
        clarity: 0.9
      },
      surfaceMotion: {
        seed: 27541,
        displacementAmplitude: 0.035,
        displacementLengthScale: 10.5,
        shoreDampingWidth: 2.4,
        turbulence: 0.12,
        crestIntensity: 0.03,
        microNormalStrength: 0.1
      },
      quality: {
        geometry: { level: RiverQualityLevel.Medium, maxSegmentCount: 512, maxChordError: 0.18 },
        material: { level: RiverQualityLevel.Medium },
        maps: { level: RiverQualityLevel.Medium },
        query: { level: RiverQualityLevel.Medium }
      }
    }
  },
  riverDebug: {
    previewStage: RiverPreviewStage.Full,
    mode: RiverDebugMode.Off,
    queryT: 0.5
  }
};
