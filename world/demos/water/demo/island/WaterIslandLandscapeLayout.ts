import { LAKE_MODELS } from "../grasslands/landscape/LakeLandscapeAssetCatalog.ts";
import type { LakeLandscapePlacement } from "../grasslands/landscape/LakeLandscapeLayout.ts";
import { sampleWaterTerrainHeight, type WaterTerrainSnapshot } from "@galacean/engine-water/water/index";
import { WATER_ISLAND_PRESET } from "./WaterIslandPreset.ts";
import { sampleIslandWater } from "./WaterIslandTerrain.ts";
export function createWaterIslandLandscapeLayout(terrain: WaterTerrainSnapshot, seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const placements: (LakeLandscapePlacement & { radius: number; zone: string })[] = [];
  const centers = [
    [-25, -52],
    [38, -16],
    [-42, 8],
    [-94, -120],
    [157, -36],
    [-150, 82],
    [-152, 12],
    [5, 82],
    [80, -110]
  ];
  const groups = [
    { zone: "tree", count: 90, models: ["china-pine", "greeting-pine", "maple"] },
    { zone: "fern", count: 180, models: ["fern"] },
    { zone: "rock", count: 220, models: ["shore-boulder", "shore-shelf", "bed-rock", "bed-clump", "bed-pebble"] }
  ];
  for (const group of groups) {
    let count = 0;
    for (let attempt = 0; attempt < group.count * 80 && count < group.count; attempt++) {
      const center = centers[Math.floor(random() * centers.length)],
        angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * (group.zone === "tree" ? 42 : 32);
      const x = center[0] + Math.cos(angle) * r,
        z = center[1] + Math.sin(angle) * r;
      const bed = sampleWaterTerrainHeight(terrain, x, z);
      if (bed === undefined) continue;
      const water = sampleIslandWater(x, z),
        d = water.shoreDistance,
        depth = water.height - bed;
      const slope =
        Math.hypot(
          sampleWaterTerrainHeight(terrain, x + 1, z)! - sampleWaterTerrainHeight(terrain, x - 1, z)!,
          sampleWaterTerrainHeight(terrain, x, z + 1)! - sampleWaterTerrainHeight(terrain, x, z - 1)!
        ) / 2;
      if (!Number.isFinite(slope)) continue;
      if (group.zone === "tree" && !(d < -3 && d > -20 && depth < -0.4 && slope < 0.65)) continue;
      if (group.zone === "tree" && z > 30 && x > 0 && random() > 0.18) continue;
      if (group.zone === "fern" && !(d < -0.6 && d > -7 && depth < -0.1 && slope < 0.8)) continue;
      if (group.zone === "rock" && !(d > -4 && d < 9 && depth < 1.5 && slope < 1.2)) continue;
      if (
        WATER_ISLAND_PRESET.connections.some(
          (c) =>
            Math.hypot(x - (c.section[0][0] + c.section[1][0]) / 2, z - (c.section[0][1] + c.section[1][1]) / 2) < 9
        )
      )
        continue;
      const radius = group.zone === "tree" ? 3.5 : group.zone === "fern" ? 0.6 : 0.5 + random() * 1.1;
      if (placements.some((p) => Math.hypot(x - p.position[0], z - p.position[2]) < p.radius + radius)) continue;
      const model = group.models[Math.floor(random() * group.models.length)] as LakeLandscapePlacement["model"];
      const spec = LAKE_MODELS.find((s) => s.id === model)!;
      const size = Math.max(
        spec.bounds.maximum[0] - spec.bounds.minimum[0],
        spec.bounds.maximum[2] - spec.bounds.minimum[2]
      );
      let scale = group.zone === "tree" ? 0.6 + random() * 0.45 : (radius * 2) / size;
      if (depth > 0) scale = Math.min(scale, (depth * 0.8) / (spec.bounds.maximum[1] - spec.bounds.minimum[1]));
      placements.push({
        id: `island-${group.zone}-${count++}`,
        zone: group.zone,
        model,
        position: [x, bed - (group.zone === "rock" ? radius * 0.2 : 0.03), z],
        scale,
        yaw: random() * 360,
        pitch: 0,
        radius
      });
    }
  }
  return placements;
}
