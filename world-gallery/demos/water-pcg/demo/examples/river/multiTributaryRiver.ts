/**
 * Single-junction river-network example.
 *
 * The gallery keeps the historical multi-tributary id, but the visible network is
 * intentionally reduced to one Y-shaped confluence: two upstream reaches merge
 * into one downstream reach. Its surface and terrain presentation reuse the exact
 * tuning used by the high-difference main-river example.
 */
import {
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel
} from "../../../authoring/river/RiverAuthoringEnums";
import { RIVER_MATERIAL_PRESET_CONFIG } from "../../../authoring/river/RiverAuthoringLimits";
import { WaterDecorationStyle } from "../../decoration/constants";
import { WaterPreviewMode } from "../constants";
import type { RiverPcgExample } from "../types";
import { CURVED_MAIN_RIVER_MATERIAL_TUNING, CURVED_MAIN_RIVER_SURFACE_MOTION } from "./constants";

export const multiTributaryRiverExample: RiverPcgExample = {
  id: "feature-river-confluence",
  label: "河流汇流",
  initialMode: WaterPreviewMode.River,
  decorationStyle: WaterDecorationStyle.HeightfieldRiver,
  view: {
    cameraPosition: [12, 58, 72],
    cameraTarget: [-12, 0, 0],
    backgroundColor: [0.05, 0.08, 0.08, 1],
    showWorldAxes: false
  },
  riverDescriptor: {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: "single-confluence-network",
    nodes: [
      {
        id: "main-source",
        kind: RiverNodeKind.Source,
        position: [-48, 0.35, -26],
        elevation: 0.35
      },
      {
        id: "tributary-source",
        kind: RiverNodeKind.Source,
        position: [-44, 0.26, 28],
        elevation: 0.26
      },
      {
        id: "main-confluence",
        kind: RiverNodeKind.Confluence,
        position: [-14, 0.08, -6],
        mergeRadius: 6,
        elevation: 0.08
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
        to: "main-confluence",
        order: 3,
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: 1.7,
          points: [
            {
              id: "main-upper-source",
              position: [-48, 0.35, -26],
              out: [8, -0.08, 5],
              width: 5.2,
              depth: 1,
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
        id: "tributary",
        from: "tributary-source",
        to: "main-confluence",
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
          mode: RiverPathMode.CatmullRom,
          segmentLength: 1.6,
          points: [
            {
              id: "tributary-source-point",
              position: [-44, 0.26, 28],
              out: [7, -0.04, -7],
              width: 3.2,
              depth: 0.62,
              flowSpeed: 1.75,
              bankFeather: 0.9
            },
            {
              id: "tributary-bend",
              position: [-29, 0.15, 13],
              in: [-6, 0.03, 5],
              out: [7, -0.03, -6],
              width: 3.8,
              depth: 0.75,
              flowSpeed: 1.6,
              bankFeather: 1
            },
            {
              id: "tributary-mouth",
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
        id: "main-lower",
        from: "main-confluence",
        to: "main-mouth",
        order: 4,
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: 1.7,
          points: [
            {
              id: "main-lower-start",
              position: [-14, 0.08, -6],
              out: [9, -0.03, 2],
              width: 7.8,
              depth: 1.55,
              flowSpeed: 1.28,
              bankFeather: 2
            },
            {
              id: "main-lower-bend-a",
              position: [8, 0.03, 4],
              in: [-8, 0.03, -2],
              out: [8, -0.03, 4],
              width: 8.4,
              depth: 1.7,
              flowSpeed: 1.18,
              bankFeather: 2.2
            },
            {
              id: "main-lower-bend-b",
              position: [30, -0.03, 16],
              in: [-8, 0.03, -4],
              out: [7, -0.03, 5],
              width: 9.2,
              depth: 1.9,
              flowSpeed: 1.04,
              bankFeather: 2.5
            },
            {
              id: "main-lower-mouth",
              position: [48, -0.08, 30],
              in: [-6, 0.02, -5],
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
        preset: RiverMaterialPreset.MountainCreek,
        ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.MountainCreek],
        ...CURVED_MAIN_RIVER_MATERIAL_TUNING
      },
      surfaceMotion: CURVED_MAIN_RIVER_SURFACE_MOTION,
      quality: {
        geometry: { level: RiverQualityLevel.Medium, maxSegmentCount: 1024, maxChordError: 0.25 },
        material: { level: RiverQualityLevel.Medium },
        maps: { level: RiverQualityLevel.Medium },
        query: { level: RiverQualityLevel.Medium }
      }
    }
  },
  riverDebug: {
    queryT: 0.52
  }
};
