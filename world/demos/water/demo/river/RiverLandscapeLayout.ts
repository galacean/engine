import { sampleWaterTerrainHeight, type WaterTerrainSnapshot } from "@galacean/engine-water/water/index";
import type { RiverPathControlPoint } from "@galacean/engine-water/water/index";
import type { LakeLandscapePlacement } from "../grasslands/landscape/LakeLandscapeLayout.ts";
import type { RiverDemoObject } from "./RiverDemoSceneSource.ts";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** The inner grid retains the canonical bed vertices (the render triangles approximate bilinear cells). Outside it,
 * a demo-only apron blends into wooded hills; it does not extend Water coverage. */
export function createRiverLandscapeGround(terrain: WaterTerrainSnapshot) {
  const [minX, minZ] = terrain.origin;
  const maxX = minX + (terrain.columns - 1) * terrain.spacing;
  const maxZ = minZ + (terrain.rows - 1) * (terrain.spacingZ ?? terrain.spacing);
  const axis = (min: number, count: number, spacing: number) => [
    ...Array.from({ length: 24 }, (_, i) => min - (24 - i) * 2),
    ...Array.from({ length: count }, (_, i) => min + i * spacing),
    ...Array.from({ length: 24 }, (_, i) => min + (count - 1) * spacing + (i + 1) * 2)
  ];
  const height = (x: number, z: number) => {
    const bx = clamp(x, minX, maxX),
      bz = clamp(z, minZ, maxZ);
    const bed = sampleWaterTerrainHeight(terrain, bx, bz)!;
    const distance = Math.hypot(x - bx, z - bz);
    const hill =
      5 +
      8 * Math.exp(-(((x + 28) / 29) ** 2) - ((z + 44) / 24) ** 2) +
      11 * Math.exp(-(((x - 35) / 26) ** 2) - ((z + 36) / 33) ** 2) +
      2.2 * Math.sin(x * 0.065 + z * 0.025) * Math.cos(z * 0.072);
    return bed + (hill - bed) * smooth(distance / 22);
  };
  return {
    x: axis(minX, terrain.columns, terrain.spacing),
    z: axis(minZ, terrain.rows, terrain.spacingZ ?? terrain.spacing),
    height
  };
}

/** Nearest authoring reach is used only to reserve scenery clearance. Water's
 * actual coverage, bed and query remain owned by its existing compiler/runtime. */
function riverClearance(points: readonly RiverPathControlPoint[], x: number, z: number) {
  let nearest = Infinity,
    clearance = Infinity,
    level = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const dx = b.position[0] - a.position[0],
      dz = b.position[2] - a.position[2];
    const t = clamp(((x - a.position[0]) * dx + (z - a.position[2]) * dz) / Math.max(1e-8, dx * dx + dz * dz), 0, 1);
    const distance = Math.hypot(x - a.position[0] - t * dx, z - a.position[2] - t * dz);
    if (distance >= nearest) continue;
    nearest = distance;
    clearance = distance - ((a.width ?? 8) + ((b.width ?? 8) - (a.width ?? 8)) * t) / 2;
    level = a.position[1] + (b.position[1] - a.position[1]) * t;
  }
  return { clearance, level };
}

/** Deterministic groves, bank stones and understory, all grounded in the same
 * staged terrain as the water. No random work or terrain edits during rendering. */
export function createRiverLandscapeLayout(
  terrain: WaterTerrainSnapshot,
  points: readonly RiverPathControlPoint[],
  objects: readonly RiverDemoObject[] = []
): readonly LakeLandscapePlacement[] {
  const ground = createRiverLandscapeGround(terrain);
  const placements: LakeLandscapePlacement[] = [];
  const occupied: { x: number; z: number; radius: number }[] = [];
  let state = 4289;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const groups = [
    { kind: "tree", count: 12, models: ["china-pine", "china-pine", "greeting-pine", "maple"] },
    { kind: "rock", count: 12, models: ["shore-boulder", "bed-clump", "bed-rock", "bed-pebble"] },
    { kind: "fern", count: 20, models: ["fern"] }
  ] as const;
  for (const group of groups) {
    let count = 0;
    for (let attempt = 0; attempt < group.count * 65 && count < group.count; attempt++) {
      // Background groves frame the upstream vista. Near-bank clusters leave
      // the southeast foreground clear for the default camera and editor.
      const distant = group.kind === "tree" && count < 7;
      const x = distant ? (random() - 0.5) * 104 : (random() - 0.5) * 39;
      const z = distant ? -112 + random() * 72 : -65 + random() * 135;
      const { clearance, level } = riverClearance(points, x, z);
      const y = ground.height(x, z);
      const slope =
        Math.hypot(
          ground.height(x + 0.4, z) - ground.height(x - 0.4, z),
          ground.height(x, z + 0.4) - ground.height(x, z - 0.4)
        ) / 0.8;
      const tree = group.kind === "tree",
        fern = group.kind === "fern";
      const radius = tree ? 3.5 : fern ? 0.48 : 1;
      if (y < level + 0.18 || slope > (tree ? 0.8 : 1.1) || clearance < (tree ? 5.2 : fern ? 0.9 : 0.6)) continue;
      if (!distant && clearance > (tree ? 15 : fern ? 6 : 8)) continue;
      if (tree && ((x > 0 && z > -10) || (z > 5 && x > -14))) continue;
      if (
        objects.some(
          (o) =>
            Math.abs(x - o.position[0]) < o.size[0] / 2 + radius && Math.abs(z - o.position[2]) < o.size[2] / 2 + radius
        )
      )
        continue;
      if (occupied.some((p) => Math.hypot(x - p.x, z - p.z) < radius + p.radius)) continue;
      const model = group.models[Math.floor(random() * group.models.length)];
      const scale = tree
        ? 0.4 + random() * 0.22
        : fern
          ? 0.45 + random() * 0.5
          : model === "shore-boulder"
            ? 0.2 + random() * 0.2
            : 0.35 + random() * 0.5;
      placements.push({
        id: `river-${group.kind}-${count++}`,
        model,
        position: [x, y - (tree || fern ? 0.04 : 0.15), z],
        scale,
        yaw: random() * 360,
        pitch: 0
      });
      occupied.push({ x, z, radius });
    }
  }
  return placements;
}
