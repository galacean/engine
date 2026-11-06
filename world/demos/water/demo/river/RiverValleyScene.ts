import manifest from "../../assets/valley/scene.json";
import {
  createRiver,
  RiverPathMode,
  RiverDisturbanceKind,
  captureWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "@galacean/engine-water/water/index";

import type { RiverPathControlPoint } from "@galacean/engine-water/water/index";

export { RIVER_VALLEY_LOOK_ID, registerRiverValleyLook } from "@galacean/engine-water/water/presets/river/index";

export const RIVER_VALLEY_MANIFEST = manifest;
export const RIVER_VALLEY_POINTS: readonly RiverPathControlPoint[] = manifest.points.map((p) => ({
  ...p,
  position: p.position as [number, number, number]
}));
export const RIVER_VALLEY_CAMERAS = {
  overview: { position: [-29.71, 18.12, -50.27], target: [4, 2.8, -82], fov: 38.3 },
  upstream: { position: [3, 24, -63], target: [26, 15, -81], fov: 45 },
  cascade: { position: [-26, 12, -55], target: [0, 6, -75], fov: 45 },
  downstream: { position: [-57, 7, -32], target: [-37, -0.5, -62], fov: 48 },
  detail: { position: [-29, 3.2, -63], target: [-28, -0.1, -72], fov: 50 },
  top: { position: [0, 90, -60], target: [0, 0, -60.01], fov: 60 },
  grazing: { position: [-13, 2.5, -63], target: [-27, -0.1, -72], fov: 50 },
  bridge: { position: [-26, 12, -55], target: [0, 6, -75], fov: 45 },
  ...Object.fromEntries(
    [2, 5, 15].map((angle) => [
      `low${angle}`,
      {
        position: [-37.89, -0.10281 + Math.hypot(12.58, 7.4) * Math.tan((angle * Math.PI) / 180), -64.71],
        target: [-25.31, -0.10281, -72.11],
        fov: 50
      }
    ])
  )
} as const;

export function createRiverValleyTerrain(heights: Float32Array): WaterTerrainSnapshot {
  const t = manifest.terrain;
  if (heights.length !== t.columns * t.rows || !heights.every(Number.isFinite)) throw new Error("河谷高度数据无效。");
  return Object.freeze({
    id: "sw2-river-valley-ground",
    revision: 1,
    origin: Object.freeze([...t.origin]) as readonly [number, number],
    spacing: t.spacing,
    columns: t.columns,
    rows: t.rows,
    heights: Object.freeze(Array.from(heights))
  });
}
export function createRiverValleySceneSource(fullTerrain: WaterTerrainSnapshot, flowSpeed: number) {
  if (!Number.isFinite(flowSpeed) || flowSpeed < 0 || flowSpeed > 3)
    throw new RangeError("河谷流速必须位于 0 到 3 米/秒。");
  const points = RIVER_VALLEY_POINTS.map((p) => ({
    ...p,
    position: [...p.position] as [number, number, number],
    flowSpeed
  }));
  const minX = Math.floor(Math.min(...points.map((p) => p.position[0] - p.width! / 2)) - 16);
  const minZ = Math.floor(Math.min(...points.map((p) => p.position[2] - p.width! / 2)) - 16);
  const maxX = Math.ceil(Math.max(...points.map((p) => p.position[0] + p.width! / 2)) + 16);
  const maxZ = Math.ceil(Math.max(...points.map((p) => p.position[2] + p.width! / 2)) + 16);
  const terrain = captureWaterTerrainSnapshot(
    {
      id: "sw2-river-valley-bed",
      revision: 1,
      origin: [minX, minZ],
      spacing: 1,
      columns: maxX - minX + 1,
      rows: maxZ - minZ + 1
    },
    (x, z) => sampleWaterTerrainHeight(fullTerrain, x, z)
  );
  // Only imported rocks with a real contact at the river elevation contribute static foam.
  const obstacles = manifest.instances
    .filter((i) => i.name.includes("Rock") && i.lod === 0)
    .flatMap((i) => {
      const [x, y, z] = i.boundsMin.map((v, index) => (v + i.boundsMax[index]) * 0.5);
      let distance = Infinity,
        surface = 0,
        halfWidth = 0;
      for (let j = 1; j < points.length; j++) {
        const a = points[j - 1],
          b = points[j];
        const dx = b.position[0] - a.position[0],
          dz = b.position[2] - a.position[2];
        const t = Math.max(0, Math.min(1, ((x - a.position[0]) * dx + (z - a.position[2]) * dz) / (dx * dx + dz * dz)));
        const d = Math.hypot(x - a.position[0] - dx * t, z - a.position[2] - dz * t);
        if (d < distance) {
          distance = d;
          surface = a.position[1] + (b.position[1] - a.position[1]) * t;
          halfWidth = (a.width! + (b.width! - a.width!) * t) * 0.5;
        }
      }
      const radius = Math.max(i.boundsMax[0] - i.boundsMin[0], i.boundsMax[2] - i.boundsMin[2]) * 0.5;
      return i.boundsMin[1] <= surface && i.boundsMax[1] >= surface && distance < halfWidth + radius
        ? [
            {
              id: i.id,
              kind: RiverDisturbanceKind.Obstacle,
              position: [x, y, z] as [number, number, number],
              radius,
              strength: 0.45
            }
          ]
        : [];
    });
  const riverDescriptor = createRiver({
    id: "river-demo",
    points,
    terrain,
    width: 9,
    depth: 1,
    speed: flowSpeed,
    obstacles
  });
  riverDescriptor.segments[0].curve.mode = RiverPathMode.MonotoneElevation;
  return { riverDescriptor, terrain, objects: [], scenario: "valley" as const };
}
