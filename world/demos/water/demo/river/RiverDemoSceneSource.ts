import { createRiverValleySceneSource } from "./RiverValleyScene.ts";
import type { WaterTerrainSnapshot, RiverPathControlPoint } from "@galacean/engine-water/water/index";
import {
  createRiver,
  RiverDisturbanceKind,
  RiverPathMode,
  captureWaterTerrainSnapshot
} from "@galacean/engine-water/water/index";

export const RIVER_DEMO_SCENARIOS = {
  风格化河谷: "valley",
  河流编辑与河槽: "editing",
  光学标定河槽: "calibration",
  弯道与宽度过渡: "bend",
  浅滩与深池: "pools",
  桥岸与反射遮挡: "bridge"
} as const;
export interface RiverDemoObject {
  id: string;
  position: [number, number, number];
  size: [number, number, number];
  color: [number, number, number];
  contactRadius?: number;
}

export function createRiverDemoObjects(scenario: RiverDemoScenario): RiverDemoObject[] {
  if (scenario !== "bridge") return [];
  return [
    { id: "bridge", position: [0, 2.3, -9], size: [15, 0.35, 1.6], color: [0.44, 0.26, 0.12] },
    {
      id: "bridge-pier-west",
      position: [-2.5, 0.4, -9],
      size: [0.65, 3.5, 0.65],
      color: [0.48, 0.46, 0.43],
      contactRadius: 0.48
    },
    {
      id: "bridge-pier-east",
      position: [2.5, 0.4, -9],
      size: [0.65, 3.5, 0.65],
      color: [0.48, 0.46, 0.43],
      contactRadius: 0.48
    },
    {
      id: "partly-submerged-rock",
      position: [1, 0.3, 6],
      size: [1.2, 1.2, 1.1],
      color: [0.5, 0.48, 0.43],
      contactRadius: 0.8
    },
    { id: "reflection-red", position: [-3.8, 2.3, -3], size: [1.1, 4.6, 1.1], color: [1, 0.025, 0.02] },
    { id: "reflection-green", position: [0, 3.5, -16], size: [1.1, 3.4, 1.1], color: [0.02, 1, 0.03] },
    { id: "reflection-blue", position: [3.8, 2.3, 1], size: [1.1, 4.6, 1.1], color: [0.02, 0.05, 1] }
  ];
}
export type RiverDemoScenario = (typeof RIVER_DEMO_SCENARIOS)[keyof typeof RIVER_DEMO_SCENARIOS];
export interface RiverDemoSceneParameters {
  scenario: RiverDemoScenario;
  width: number;
  depth: number;
  flowSpeed: number;
}
export const RIVER_DEMO_SCENE_DEFAULTS: RiverDemoSceneParameters = {
  scenario: "valley",
  width: 8,
  depth: 1,
  flowSpeed: 1
};

export const RIVER_DEMO_HALF_LENGTH = 96;

/** Demo owns the mock bed. Water only receives a captured, immutable terrain version. */
export function createRiverDemoSceneSource(
  parameters: RiverDemoSceneParameters,
  revision: number,
  valleyTerrain?: WaterTerrainSnapshot
) {
  const { scenario, width, depth, flowSpeed } = parameters;
  if (scenario === "valley") {
    if (!valleyTerrain) throw new Error("河谷地形尚未加载。");
    return createRiverValleySceneSource(valleyTerrain, flowSpeed);
  }
  // Keep seven editable handles; presentation reaches use denser samples for gentle bends.
  const pointCount = scenario === "editing" ? 7 : 25;
  const points = Array.from({ length: pointCount }, (_, index) => {
    const t = index / (pointCount - 1);
    const z = (2 * t - 1) * RIVER_DEMO_HALF_LENGTH;
    const pool = Math.exp(-(((z - 4) / 24) ** 2));
    const widthScale =
      scenario === "bridge"
        ? 0.65 + 0.85 * (1 - Math.exp(-(((z + 9) / 22) ** 2)))
        : scenario === "pools"
          ? 0.6 + 0.95 * pool + 0.18 * Math.sin(t * Math.PI * 3) ** 2
          : 0.6 + 0.95 * Math.sin(t * Math.PI * 2 + 0.3) ** 2;
    const x =
      scenario === "calibration"
        ? 0
        : scenario === "bridge"
          ? 5 * Math.sin(z / 36) * Math.min(1, Math.max(0, (Math.abs(z) - 24) / 32))
          : scenario === "pools"
            ? 5 * Math.sin(t * Math.PI * 4)
            : scenario === "editing"
              ? 4 * Math.sin(t * Math.PI * 2)
              : 8 * Math.sin(t * Math.PI * 4);
    return {
      id: `point-${index}`,
      position: [x, scenario === "calibration" ? 0.5 : (1 - t) * 0.6, z],
      width: width * widthScale,
      depth: depth * (scenario === "pools" ? 0.4 + 2.1 * pool : 1),
      flowSpeed
    } satisfies RiverPathControlPoint;
  });
  const terrain = captureWaterTerrainSnapshot(
    {
      id: `mock-${scenario}`,
      revision: scenario === "editing" ? 1 : revision,
      origin: [-24, -108],
      spacing: 0.5,
      columns: 97,
      rows: 433
    },
    (x, z) => {
      if (scenario === "editing") {
        // Independent terrain fixture: no River points, width, depth or flow inputs.
        return -1.1 + 0.018 * x * x + 0.12 * Math.sin(z * 0.2);
      }
      let nearestDistance = Number.POSITIVE_INFINITY;
      let bedHeight = 0;
      let bankDistance = 0;
      for (let index = 1; index < points.length; index++) {
        const a = points[index - 1];
        const b = points[index];
        const dx = b.position[0] - a.position[0];
        const dz = b.position[2] - a.position[2];
        const t = Math.max(0, Math.min(1, ((x - a.position[0]) * dx + (z - a.position[2]) * dz) / (dx * dx + dz * dz)));
        const distance = Math.hypot(x - a.position[0] - dx * t, z - a.position[2] - dz * t);
        if (distance >= nearestDistance) continue;
        nearestDistance = distance;
        const waterSurfaceHeight = a.position[1] + (b.position[1] - a.position[1]) * t;
        const halfWidth = (a.width + (b.width - a.width) * t) * 0.5;
        const centerDepth = a.depth + (b.depth - a.depth) * t;
        const normalizedBankDistance = distance / halfWidth;
        bankDistance = distance - halfWidth;
        if (scenario === "calibration") {
          const calibrationDepth = z < -8 ? 0.25 : z < 8 ? 1 : 3;
          bedHeight =
            normalizedBankDistance < 1 && Math.abs(z) <= RIVER_DEMO_HALF_LENGTH ? 0.5 - calibrationDepth : 1.3;
          continue;
        }
        bedHeight =
          normalizedBankDistance <= 1
            ? waterSurfaceHeight - centerDepth * (1 - normalizedBankDistance * normalizedBankDistance) - 0.12
            : waterSurfaceHeight - 0.12 + Math.min(1.8, (distance - halfWidth) * 0.8);
      }
      if (scenario === "calibration") return bedHeight;
      // Bank relief is baked into this same snapshot, so visible ground and
      // Water bed sampling remain identical. The wet channel stays unchanged.
      const bankBlend = Math.max(0, Math.min(1, bankDistance / 8));
      const relief =
        0.6 + 0.45 * Math.sin(x * 0.22 + z * 0.09) + 1.7 * Math.exp(-((x + 14) ** 2 / 120 + (z + 7) ** 2 / 280));
      return bedHeight + relief * bankBlend * bankBlend * (3 - 2 * bankBlend);
    }
  );
  const objects = createRiverDemoObjects(scenario);
  const riverDescriptor = createRiver({
    id: "river-demo",
    points,
    width,
    depth,
    speed: flowSpeed,
    terrain,
    obstacles: objects
      .filter((object) => object.contactRadius !== undefined)
      .map((object) => ({
        id: object.id,
        kind: RiverDisturbanceKind.Obstacle,
        position: object.position,
        radius: object.contactRadius!,
        strength: 0.7
      }))
  });
  riverDescriptor.segments[0].curve.mode = RiverPathMode.Polyline;
  return { riverDescriptor, terrain, objects, scenario };
}
