import {
  RiverDirectionMode,
  RiverMaterialPreset,
  RiverNetworkSchemaVersion,
  RiverNodeKind,
  RiverPathMode,
  RiverQualityLevel
} from "../../authoring/river/RiverAuthoringEnums";
import { RIVER_MATERIAL_PRESET_CONFIG } from "../../authoring/river/RiverAuthoringLimits";
import type { RiverPathControlPoint } from "../../authoring/river/RiverAuthoringTypes";
import type { RiverNetworkDescriptor } from "../../authoring/river/RiverDescriptor";
import type { RiverDemoConfig as RiverConfig } from "../../demo/types";

function makeConfig(id: string, points: RiverPathControlPoint[], mode: RiverPathMode): RiverConfig {
  return {
    id,
    path: { points, mode, segmentLength: 1 },
    shape: { width: 4, depth: 1, bankFeather: 1 },
    flow: { speed: 1.2, directionMode: RiverDirectionMode.PathOrder },
    material: {
      preset: RiverMaterialPreset.ClearStream,
      ...RIVER_MATERIAL_PRESET_CONFIG[RiverMaterialPreset.ClearStream]
    },
    quality: {
      geometry: { level: RiverQualityLevel.Medium, maxSegmentCount: 128, maxChordError: 0.08 },
      material: { level: RiverQualityLevel.Medium },
      maps: { level: RiverQualityLevel.Low },
      query: { level: RiverQualityLevel.Medium }
    },
    debug: { queryT: 0.5 }
  };
}

export const straightFixture = makeConfig(
  "straight",
  [
    { id: "start", position: [0, 0, 0] },
    { id: "end", position: [10, 0, 0] }
  ],
  RiverPathMode.Polyline
);

export const sharpBendFixture = makeConfig(
  "sharp-bend",
  [
    { id: "start", position: [0, 0, 0] },
    { id: "bend", position: [4, 0, 0] },
    { id: "end", position: [4, 0, 5] }
  ],
  RiverPathMode.Polyline
);

export const variableProfileFixture = makeConfig(
  "variable-profile",
  [
    { id: "start", position: [0, 0, 0], width: 2, depth: 0.5, flowSpeed: 2, bankFeather: 0.4, out: [2, 0, 3] },
    {
      id: "middle",
      position: [5, 0.2, 4],
      width: 9,
      depth: 2.5,
      flowSpeed: 0.8,
      bankFeather: 2,
      in: [-2, 0, -3],
      out: [2, 0, 1]
    },
    { id: "end", position: [11, 0, 5], width: 4, depth: 1.2, flowSpeed: 1.4, bankFeather: 1, in: [-2, 0, -1] }
  ],
  RiverPathMode.Bezier
);

export const longOverBudgetFixture: RiverConfig = {
  ...makeConfig(
    "long-over-budget",
    [
      { id: "start", position: [0, 0, 0] },
      { id: "anchor-a", position: [40, 0, 10] },
      { id: "anchor-b", position: [80, 0, -10] },
      { id: "end", position: [120, 0, 0] }
    ],
    RiverPathMode.CatmullRom
  ),
  quality: {
    geometry: { level: RiverQualityLevel.Low, maxSegmentCount: 8, maxChordError: 0.5 },
    material: { level: RiverQualityLevel.Low },
    maps: { level: RiverQualityLevel.Low },
    query: { level: RiverQualityLevel.Low }
  }
};

export const webGL1LowFixture: RiverConfig = {
  ...straightFixture,
  id: "webgl1-low",
  quality: {
    geometry: { level: RiverQualityLevel.Low, maxSegmentCount: 32, maxChordError: 0.6 },
    material: { level: RiverQualityLevel.Low },
    maps: { level: RiverQualityLevel.Low },
    query: { level: RiverQualityLevel.Low }
  }
};

export const invalidNetworkFixture: RiverNetworkDescriptor = {
  schemaVersion: RiverNetworkSchemaVersion.V1,
  id: "invalid-network",
  nodes: [
    { id: "duplicate", kind: RiverNodeKind.Source, position: [0, 0, 0] },
    { id: "duplicate", kind: RiverNodeKind.Mouth, position: [10, 1, 0] }
  ],
  segments: [
    {
      id: "broken-segment",
      from: "duplicate",
      to: "missing-node",
      curve: { mode: RiverPathMode.Polyline, segmentLength: 1, points: straightFixture.path.points }
    }
  ],
  defaults: {
    shape: straightFixture.shape,
    flow: straightFixture.flow,
    material: straightFixture.material,
    quality: straightFixture.quality
  }
};

export const bifurcationNetworkFixture: RiverNetworkDescriptor = {
  schemaVersion: RiverNetworkSchemaVersion.V1,
  id: "bifurcation-network",
  nodes: [
    { id: "source", kind: RiverNodeKind.Source, position: [0, 2, 0], elevation: 2 },
    { id: "split", kind: RiverNodeKind.Bifurcation, position: [10, 1, 0], elevation: 1, mergeRadius: 3 },
    { id: "left-mouth", kind: RiverNodeKind.Mouth, position: [20, 0, 5], elevation: 0 },
    { id: "right-mouth", kind: RiverNodeKind.Mouth, position: [20, 0, -5], elevation: 0 }
  ],
  segments: [
    {
      id: "trunk",
      from: "source",
      to: "split",
      curve: {
        mode: RiverPathMode.Polyline,
        segmentLength: 1,
        points: [
          { id: "source-point", position: [0, 2, 0] },
          { id: "split-in-point", position: [10, 1, 0] }
        ]
      }
    },
    {
      id: "left-branch",
      from: "split",
      to: "left-mouth",
      curve: {
        mode: RiverPathMode.Polyline,
        segmentLength: 1,
        points: [
          { id: "split-left-point", position: [10, 1, 0] },
          { id: "left-mouth-point", position: [20, 0, 5] }
        ]
      }
    },
    {
      id: "right-branch",
      from: "split",
      to: "right-mouth",
      curve: {
        mode: RiverPathMode.Polyline,
        segmentLength: 1,
        points: [
          { id: "split-right-point", position: [10, 1, 0] },
          { id: "right-mouth-point", position: [20, 0, -5] }
        ]
      }
    }
  ],
  defaults: {
    shape: straightFixture.shape,
    flow: straightFixture.flow,
    material: straightFixture.material,
    quality: straightFixture.quality
  }
};
