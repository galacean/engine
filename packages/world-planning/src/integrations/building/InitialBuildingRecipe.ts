import type { ConstructionUnitAssets } from "@galacean/engine-building/tiny-glade/runtime/ConstructionCompiler";
import { constructionDecorationRecipe } from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorationRecipe";
import { gothicPlacement } from "@galacean/engine-building/tiny-glade/runtime/GothicPlacement";
import { roofAttachmentUV } from "@galacean/engine-building/tiny-glade/runtime/RoofAttachmentUV";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { ConstructionBuilding } from "@galacean/engine-building/tiny-glade/runtime/ConstructionSource";
import { constructionRoof } from "@galacean/engine-building/tiny-glade/runtime/ConstructionSource";
import {
  defaultConstructionDecorations,
  normalizeConstructionDecorations
} from "@galacean/engine-building/tiny-glade/runtime/ConstructionDecorations";
import { isFlatRoofHeight } from "@galacean/engine-building/tiny-glade/runtime/RoofMode";
import { roofHeight } from "@galacean/engine-building/tiny-glade/runtime/RecoveredRoofMath";
import {
  parseMasonryDocument,
  type MasonryDocument,
  type MasonryBinding,
  type MaterialUnit
} from "@galacean/engine-building/tiny-glade/runtime/MasonryDocument";
import { planningRemovedObjectIds } from "../../spatial/PlanningResources";

export interface InitialBuildingGroup {
  id: string;
  ownerIds: string[];
  /** Explicit construction identity to planning owner mapping. ownerIds remains
   * for renderer compatibility; no consumer should infer ownership by array index. */
  ownerIdByBuildingId: Readonly<Record<string, string>>;
  document: MasonryDocument;
}

function stableBuildingSeed(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Consumes published metre/yaw intent once. No random relocation, no Cozy adapter. */
export function initialBuildingGroups(plan: IslandPlan, assets: ConstructionUnitAssets): InitialBuildingGroup[] {
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []),
    members: { owner: string; b: ConstructionBuilding; radius: number }[] = [];
  for (const p of plan.buildings) {
    if (removed.has(p.id)) continue;
    const seed = stableBuildingSeed(plan.parameters.seed + ":" + p.id),
      aspect = Math.max(p.width, p.depth) / Math.min(p.width, p.depth);
    const round = aspect < 1.3 && (seed % 4 === 0 || p.height > Math.min(p.width, p.depth) * 1.2);
    const b: ConstructionBuilding = {
      id: p.id,
      seed,
      height: p.height,
      material: 0,
      wall_color: (seed >>> 4) % 3,
      wood_color: (seed >>> 8) % 3,
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
    const r = constructionRoof(b, 0);
    b.height = Math.max(
      0.5,
      p.height -
        (isFlatRoofHeight(b.roof.height) ? 0 : roofHeight(r.surface, r.footprint)) -
        (b.foundation?.height ?? 0) +
        0.46
    );
    b.decorations = normalizeConstructionDecorations(
      defaultConstructionDecorations(b),
      isFlatRoofHeight(b.roof.height)
    );
    if (!isFlatRoofHeight(b.roof.height) && p.width > 6 && p.depth > 6 && seed % 5 === 0) {
      // Keep the initial recipe's original surface position, but author one
      // public roof-window specification. The producer decides whether it fits.
      const roof = constructionRoof(b, b.height),
        mount = gothicPlacement(roof.surface, roof.footprint, [0.45, 0.3]);
      if (!mount) throw Error("Initial roof window has no surface mount");
      const recipe = constructionDecorationRecipe(assets.decorations, "dormer-gothic", 1)!;
      b.decorations.push({
        id: "gothic",
        kind: "window",
        type: "dormer-gothic",
        host: "roof",
        rank: 1,
        uv: roofAttachmentUV(roof.footprint, mount.translation),
        bottom: 0,
        width: recipe.installationSize[0],
        height: recipe.installationSize[1],
        woodColor: 0,
        lightIntensity: 0
      });
    }
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
        material: 0,
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
    const bindings: MasonryBinding[] = buildings.flatMap((b) => {
      const roles = b.kind ? ["surface"] : ["roof", "wall", "foundation"];
      return roles.map((role) => {
        const id = b.id + "-" + role,
          seed = b.seed ?? 0;
        const fallback: MaterialUnit =
          b.kind === "fence"
            ? "wooden_plank"
            : role === "wall"
              ? "brick"
              : role === "roof"
                ? isFlatRoofHeight(b.roof.height)
                  ? (seed >>> 3) % 2
                    ? "wooden_plank"
                    : "brick"
                  : "roof_tile"
                : "brick";
        return {
          id,
          geometry_id: id,
          rule: { type: b.kind === "fence" ? "posts_and_rails" : "auto" },
          unit_id: fallback,
          footprint: { width: 0.5, height: 0.4375, depth: 0.1 },
          seed: "source"
        };
      });
    });
    return {
      id: JSON.stringify(buildings.map((b) => b.id)),
      ownerIds: group.map((m) => m.owner),
      ownerIdByBuildingId: Object.fromEntries(group.map((m) => [m.b.id, m.owner])),
      document: parseMasonryDocument({
        version: 1,
        construction: {
          version: 1,
          environment: { type: "host_terrain" },
          identity_order: buildings.map((b) => b.id),
          buildings
        },
        bindings,
        overrides: [],
        placement: { position: [x, 0, z], rotationY: 0 }
      })
    };
  });
}
