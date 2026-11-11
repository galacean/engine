import { envelope } from "../../semantic-study/IslandPlanAtoms";
import type { IslandPlan, PlanLandscape, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { boxGroundBottom } from "./VolumeTerrain";

export const MOJAVE_ROCK_GROUP = "mojave/A01";
export const MOJAVE_STONE = "mojave/R03";

// Offsets in metres around the spawn. Stagger the two sides, leaving an open approach.
const patches = [
  [-14, -27],
  [20, -48],
  [-24, -78],
  [18, -116],
  [-21, -139],
  [115, -214],
  [-58, -248],
  [53, -280],
  [-152, -301],
  [157, -325],
  [-97, -379],
  [73, -416],
  [-83, 43],
  [77, 65],
  [-133, 150],
  [125, 171],
  [31, -72],
  [-43, -101],
  [57, -155],
  [-67, -188],
  [109, -46],
  [-121, -62]
] as const;

export function publishMojaveDesertLayout(plan: IslandPlan, ground: (point: PlanPoint) => number): PlanLandscape[] {
  if (plan.parameters.worldTemplate?.id !== "titan-wasteland" || !plan.worldTemplateSite?.centeredStart) return [];
  const origin = plan.worldTemplateSite.centeredStart;
  const owner = "mojave-desert";
  const landscape: PlanLandscape[] = [];
  const occupied = [...plan.rocks, ...plan.buildings, ...(plan.landscapes ?? []), ...plan.waters].map(({ outline }) =>
    createPlanningRingQuery(outline)
  );

  for (const [index, [x, z]] of patches.entries()) {
    const patch = `${owner}:${index}`;
    const random = (key: string) => settlementRandom(plan.parameters.seed, `${patch}:${key}`);
    const anchor = { x: origin.x + x + (random("x") - 0.5) * 9, z: origin.z + z + (random("z") - 0.5) * 12 };
    const place = (key: string, center: PlanPoint, size: readonly [number, number, number], scale: number) => {
      const [width, height, depth] = size.map((value) => value * scale);
      const yaw = random(`${key}:yaw`) * Math.PI * 2;
      const outline = envelope(center, width, depth, yaw);
      if (outline.some((p) => p.x < 1 || p.z < 1 || p.x > plan.parameters.width - 1 || p.z > plan.parameters.depth - 1))
        return;
      // Keep the full footprint out of the walking corridor, including rotated corners.
      const dx = outline.map((p) => p.x - origin.x);
      const dz = outline.map((p) => p.z - origin.z);
      if (Math.min(...dx) < 5 && Math.max(...dx) > -5 && Math.min(...dz) < 0 && Math.max(...dz) > -110) return;
      if (occupied.some((area) => area.overlapsPolygon(outline))) return;
      const baseHeight = boxGroundBottom({ center, width, depth, yaw }, ground);
      if (!Number.isFinite(baseHeight) || ground(center) - baseHeight > height * 0.45) return;
      occupied.push(createPlanningRingQuery(outline));
      return { center, width, height, depth, yaw, outline, baseHeight };
    };

    const group = place("group", anchor, [11.13, 5.4, 7.42], 0.8 + random("group:size") * 0.55);
    if (group) {
      const id = `${patch}:group`;
      plan.rocks.push({
        ...group,
        id,
        groupId: id,
        assetId: MOJAVE_ROCK_GROUP,
        role: "skirt",
        baseHeight: group.baseHeight - group.height * 0.05,
        obb: group.outline
      });
    }

    for (const member of [1, 4, 6]) {
      const id = `${patch}:landscape:${member}`;
      const angle = ((member + random(`${id}:angle`) * 0.6) / 7) * Math.PI * 2;
      const radius = 7 + random(`${id}:radius`) * 15;
      const center = { x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius };
      const scale = member === 6 ? 0.32 + random(`${id}:size`) * 0.36 : 0.62 + random(`${id}:size`) * 0.64;
      const item = place(id, center, [3.38, 2.15, 2.52], scale);
      if (!item) continue;
      landscape.push({
        ...item,
        id,
        ownerId: id,
        sourceId: patch,
        role: "ambient",
        kind: "rock",
        assetId: MOJAVE_STONE,
        collisionRadius: Math.min(item.width, item.depth) / 2,
        canopyRadius: Math.hypot(item.width, item.depth) / 2
      });
    }
  }
  return landscape;
}
