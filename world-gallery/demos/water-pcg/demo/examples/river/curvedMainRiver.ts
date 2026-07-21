/**
 * Curved main-river example.
 *
 * This preserves the current water-pcg river scene as a standalone example file:
 * one visibly downhill Catmull-Rom-authored mountain channel, local width/depth/flow
 * overrides on control points, and an oblique survey view that exposes the
 * source-to-mouth elevation profile instead of flattening it in plan view.
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
import { RIVER_MATERIAL_PRESET_CONFIG } from "../../../authoring/river/RiverAuthoringLimits";
import { WaterDecorationStyle } from "../../decoration/constants";
import { WaterPreviewMode } from "../constants";
import type { RiverPcgExample } from "../types";
import {
  CURVED_MAIN_RIVER_MATERIAL_TUNING,
  CURVED_MAIN_RIVER_SURFACE_MOTION,
  CURVED_MAIN_RIVER_VIEW
} from "./constants";

export const curvedMainRiverExample: RiverPcgExample = {
  id: "curved-main-river",
  label: "高差河流",
  initialMode: WaterPreviewMode.River,
  decorationStyle: WaterDecorationStyle.HeightfieldRiver,
  view: CURVED_MAIN_RIVER_VIEW,
  riverDescriptor: {
    schemaVersion: RiverNetworkSchemaVersion.V2,
    id: "demo-river-network",
    nodes: [
      {
        id: "main-source",
        kind: RiverNodeKind.Source,
        position: [-42, 10, -24],
        elevation: 10
      },
      {
        id: "main-mouth",
        kind: RiverNodeKind.Mouth,
        position: [42, 0, 26],
        elevation: 0
      }
    ],
    segments: [
      {
        id: "main-river",
        from: "main-source",
        to: "main-mouth",
        order: 3,
        curve: {
          mode: RiverPathMode.CatmullRom,
          segmentLength: 1.8,
          points: [
            {
              id: "main-source-point",
              position: [-42, 10, -24],
              out: [5.4, -0.6, 5.6],
              width: 5.6,
              depth: 1.0,
              flowSpeed: 2.2,
              bankFeather: 1.2
            },
            {
              id: "main-upper-bend",
              position: [-32, 8.5, -12],
              in: [-4.8, 0.6, -5.0],
              out: [5.8, -0.6, 4.4],
              width: 6.5,
              depth: 1.2,
              flowSpeed: 2.0,
              bankFeather: 1.55
            },
            {
              id: "main-mid-bend-a",
              position: [-18, 7.0, -3],
              in: [-5.8, 0.6, -3.4],
              out: [6.2, -0.6, 3.8],
              width: 7.2,
              depth: 1.4,
              flowSpeed: 1.8,
              bankFeather: 1.8
            },
            {
              id: "main-mid-bend-b",
              position: [-4, 5.5, 6],
              in: [-5.6, 0.6, -3.8],
              out: [6.4, -0.6, 1.8],
              width: 7.8,
              depth: 1.6,
              flowSpeed: 1.65,
              bankFeather: 2.0
            },
            {
              id: "main-lower-bend-a",
              position: [12, 4.0, 2],
              in: [-6.2, 0.6, 2.4],
              out: [6.0, -0.6, 3.6],
              width: 7.1,
              depth: 1.5,
              flowSpeed: 1.55,
              bankFeather: 1.85
            },
            {
              id: "main-lower-bend-b",
              position: [28, 2.0, 14],
              in: [-6.0, 0.6, -4.2],
              out: [5.2, -0.6, 5.0],
              width: 6.7,
              depth: 1.35,
              flowSpeed: 1.45,
              bankFeather: 1.65
            },
            {
              id: "main-mouth-point",
              position: [42, 0, 26],
              in: [-5.2, 0.6, -5.0],
              width: 8.4,
              depth: 1.8,
              flowSpeed: 1.35,
              bankFeather: 2.2
            }
          ]
        }
      }
    ],
    disturbances: [
      {
        id: "upper-bend-boulder",
        kind: RiverDisturbanceKind.Obstacle,
        position: [-25, 7.7, -8],
        radius: 1.05,
        strength: 1.1
      },
      {
        id: "middle-channel-boulder",
        kind: RiverDisturbanceKind.Obstacle,
        position: [-1, 5.2, 4.8],
        radius: 0.9,
        strength: 0.95
      },
      {
        id: "lower-bend-boulder",
        kind: RiverDisturbanceKind.Obstacle,
        position: [20, 3.0, 7.5],
        radius: 1.55,
        strength: 1.25
      }
    ],
    defaults: {
      shape: {
        width: 7,
        depth: 1.4,
        bankFeather: 1.8
      },
      flow: {
        speed: 1.7,
        directionMode: RiverDirectionMode.PathOrder
      },
      material: {
        preset: RiverMaterialPreset.MountainCreek,
        ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.MountainCreek],
        ...CURVED_MAIN_RIVER_MATERIAL_TUNING
      },
      surfaceMotion: CURVED_MAIN_RIVER_SURFACE_MOTION,
      quality: {
        geometry: { level: RiverQualityLevel.Medium, maxSegmentCount: 512, maxChordError: 0.25 },
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
