import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import {
  European,
  type EuropeanHouseParameters,
  type EuropeanSurfaceStyle
} from "@galacean/engine-building/building/application/European";
import type { BuildingCoreDraft } from "@galacean/engine-building/building/core/index";
import { profileRoofGeometry, profileShape } from "@galacean/engine-building/building/runtime/ProfileGeometry";
import type {
  ProfileFootprint,
  ProfileRoofParameters
} from "@galacean/engine-building/building/runtime/ProfileParameters";
import {
  planFacadeDecorations,
  normalizeDecorationPlan
} from "@galacean/engine-building/building/runtime/DecorationPlan";
import { isFlatRoofHeight } from "@galacean/engine-building/building/runtime/RoofMode";
import { roofHeight } from "@galacean/engine-building/building/runtime/RecoveredRoofMath";
import { planningRemovedObjectIds } from "../spatial/PlanningResources";

export interface InitialBuildingDraft {
  id: string;
  ownerIds: string[];
  ownerIdByBuildingId: Readonly<Record<string, string>>;
  draft: BuildingCoreDraft;
  position: [number, number, number];
}
type InitialMember = EuropeanHouseParameters & {
  height: number;
  seed: number;
  roof: ProfileRoofParameters;
  kind?: "wall" | "fence";
};

function stableBuildingSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Consumes published metre/yaw intent once. No random relocation, no Cozy adapter. */
export function initialBuildingDrafts(plan: IslandPlan): InitialBuildingDraft[] {
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []),
    members: { owner: string; b: InitialMember; radius: number }[] = [];
  for (const p of plan.buildings) {
    if (removed.has(p.id)) continue;
    const seed = stableBuildingSeed(plan.parameters.seed + ":" + p.id),
      aspect = Math.max(p.width, p.depth) / Math.min(p.width, p.depth);
    const round = aspect < 1.3 && (seed % 4 === 0 || p.height > Math.min(p.width, p.depth) * 1.2);
    const b: InitialMember = {
      id: p.id,
      seed,
      height: p.height,
      wallStructure: "masonry",
      wallColor: (seed >>> 4) % 3,
      woodColor: (seed >>> 8) % 3,
      foundation: { height: 0, mode: "auto" },
      plaster: { enabled: true, wear: 0.15 + ((seed >>> 16) % 4) * 0.1, color: (seed >>> 20) % 8 },
      floors: { enabled: true, interval: 3.5 },
      ...(round
        ? { circle: { center: [p.center.x, p.center.z], radius: Math.min(p.width, p.depth) * 0.46, phase: p.yaw } }
        : {
            rectangle: {
              center: [p.center.x, p.center.z],
              size: [Math.max(p.width, p.depth) * 0.92, Math.min(p.width, p.depth) * 0.92],
              rotation: p.yaw + (p.width >= p.depth ? 0 : Math.PI / 2)
            }
          }),
      roof: {
        tip: [0, 0],
        profile: ((seed >>> 12) % 5) / 4,
        height: seed % 7 === 0 ? 0 : Math.max(0.11, Math.min(0.5, (p.height * 0.35 - 0.4) / 11.6)),
        ridge_length: !round && seed % 3 === 0 ? 1 : 0.6,
        eave: !round && seed % 3 === 0 ? 0.2 : 0.3,
        ridge_direction: 0,
        flat_rim: 0,
        color: (seed >>> 6) % 4
      }
    };
    const r = profileRoofGeometry(profileShape(b as ProfileFootprint), b.roof, 0);
    b.height = Math.max(
      0.5,
      p.height -
        (isFlatRoofHeight(b.roof.height) ? 0 : roofHeight(r.surface, r.footprint)) -
        (b.foundation?.height ?? 0) +
        0.46
    );
    b.attachments = normalizeDecorationPlan(planFacadeDecorations(b), isFlatRoofHeight(b.roof.height));
    if (!isFlatRoofHeight(b.roof.height) && p.width > 6 && p.depth > 6 && seed % 5 === 0)
      // One Gothic dormer on the front slope, a little left of the middle, at its own size. A
      // design that cannot fit it lays nothing, and the village drops it.
      b.attachments!.push({
        id: "gothic",
        kind: "window",
        type: "dormer-gothic",
        host: "roof",
        rank: 1,
        uv: [0.45, 0.3]
      });
    members.push({ owner: p.id, b, radius: Math.hypot(p.width, p.depth) / 2 + 0.5 });
  }
  const enclose = (owner: string, box: NonNullable<IslandPlan["fences"]>[number], kind: "wall" | "fence") => {
    if (removed.has(owner)) return;
    // X is the strip direction, independently of the OBB's longer local axis.
    const swap = box.sizeZ > box.sizeX,
      length = swap ? box.sizeZ : box.sizeX,
      depth = swap ? box.sizeX : box.sizeZ;
    members.push({
      owner,
      b: {
        id: box.id,
        seed: stableBuildingSeed(plan.parameters.seed + ":" + box.id),
        kind,
        height: box.sizeY,
        wallStructure: "masonry",
        rectangle: {
          center: [box.center.x, box.center.z],
          size: [length, depth],
          rotation: box.yaw + (swap ? Math.PI / 2 : 0)
        },
        roof: {
          tip: [0, 0],
          profile: 0,
          height: 0,
          ridge_length: 0,
          eave: 0,
          ridge_direction: 0,
          flat_rim: 0,
          color: 2
        }
      },
      radius: Math.hypot(length, depth) / 2
    });
  };
  for (const yard of plan.courtyards ?? []) for (const box of yard.fences) enclose(yard.regionId, box, "wall");
  for (const box of plan.fences ?? []) enclose(box.id, box, "fence");
  // Connect only potentially touching houses. Enclosure strips retain their own terrain/LOD owner.
  const parents = members.map((_, i) => i);
  const find = (i: number): number => (parents[i] === i ? i : (parents[i] = find(parents[i])));
  for (let i = 0; i < members.length; i++)
    for (let j = 0; j < i; j++) {
      const a = members[i],
        b = members[j];
      if (a.b.kind || b.b.kind) continue;
      const ac = (a.b.circle ?? a.b.rectangle)!.center,
        bc = (b.b.circle ?? b.b.rectangle)!.center;
      if (Math.hypot(ac[0] - bc[0], ac[1] - bc[1]) <= a.radius + b.radius) parents[find(i)] = find(j);
    }
  const groups = new Map<number, typeof members>();
  members.forEach((m, i) => {
    const k = find(i);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  });
  return [...groups.values()].map((group) => {
    group.sort((a, b) => a.b.id.localeCompare(b.b.id));
    const centers = group.map((m) => (m.b.circle ?? m.b.rectangle)!.center),
      x = centers.reduce((v, p) => v + p[0], 0) / group.length,
      z = centers.reduce((v, p) => v + p[1], 0) / group.length;
    const buildings = group.map((m) => {
      const b = structuredClone(m.b);
      const shape = (b.circle ?? b.rectangle)!;
      shape.center = [shape.center[0] - x, shape.center[1] - z];
      return b;
    });
    const drafts = buildings.map((b) => {
      const style = (unit: "brick" | "roof_tile" | "wooden_plank"): EuropeanSurfaceStyle => ({
        unit,
        footprint: { width: 0.5, height: 0.4375, depth: 0.1 }
      });
      if (b.kind) {
        const r = b.rectangle!;
        return (b.kind === "wall" ? European.buildWall : European.buildFence)({
          id: b.id,
          seed: b.seed,
          center: r.center as [number, number],
          rotation: r.rotation,
          length: r.size[0],
          depth: r.size[1],
          height: b.height,
          style: style(b.kind === "wall" ? "brick" : "wooden_plank")
        });
      }
      const { kind: _kind, ...house } = b;
      const roofUnit = isFlatRoofHeight(b.roof.height) ? ((b.seed >>> 3) % 2 ? "wooden_plank" : "brick") : "roof_tile";
      return European.buildHouses({
        ...(house as EuropeanHouseParameters),
        wall: style("brick"),
        roofStyle: style(roofUnit),
        attachments: b.attachments?.map((spec) => ({ ...spec, id: "decoration:" + spec.id }))
      });
    });
    return {
      id: JSON.stringify(buildings.map((b) => b.id)),
      ownerIds: group.map((m) => m.owner),
      ownerIdByBuildingId: Object.fromEntries(group.map((m) => [m.b.id, m.owner])),
      draft: {
        groups: drafts.flatMap((d) => d.groups),
        parts: drafts.flatMap((d) => d.parts),
        connections: drafts.flatMap((d) => d.connections ?? [])
      },
      position: [x, 0, z]
    };
  });
}
