import { treeWhiteboxes } from "./TreeWhitebox";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { V2Box } from "../spatial/V2Model.ts";
import { BRIDGE_DECK_THICKNESS_M, BRIDGE_TOWER_WIDTH_M } from "@galacean/engine-water/bridges/SuspensionBridge";
import { planningRemovedObjectIds } from "../spatial/PlanningResources";

/** Published solid volumes shared by whitebox rendering, picking and movement. */
export interface PlanningWhiteboxPart {
  id: string;
  layer: "rock" | "building" | "tree" | "landscape-rock" | "bridge" | "bridge-structure";
  boxes: V2Box[];
}
/** Adapt published dimensions without fitting, rescaling or generating decorative models.
 * Trees use a trunk and raised canopy envelopes; all views and measurement share these boxes.
 * @param plan Published spatial plan.
 * @param ground Height fallback for older snapshots without explicit base heights.
 * @returns Solid parts in stable source order, with metre dimensions and radian yaw.
 */
export function planningWhiteboxes(plan: IslandPlan, ground: (p: PlanPoint) => number): PlanningWhiteboxPart[] {
  const parts: PlanningWhiteboxPart[] = [];
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  for (const bridge of plan.bridges ?? [])
    if (bridge.deckY !== undefined) {
      const points = bridge.deckPath ?? [
        { ...bridge.a, y: bridge.deckY },
        { ...bridge.b, y: bridge.deckY }
      ];
      parts.push({
        id: bridge.id,
        layer: "bridge",
        boxes: points.slice(1).map((b, i) => {
          const a = points[i];
          return {
            id: bridge.id + ":" + i,
            label: bridge.label,
            center: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
            sizeX: Math.hypot(b.x - a.x, b.z - a.z) + 0.08,
            sizeZ: bridge.width,
            sizeY: bridge.suspension ? BRIDGE_DECK_THICKNESS_M : 0.4,
            yaw: Math.atan2(b.z - a.z, b.x - a.x),
            elevation: (a.y + b.y) / 2 - (bridge.suspension ? BRIDGE_DECK_THICKNESS_M : 0.4),
            collision: true,
            occlusion: true
          };
        })
      });
      if (bridge.suspension) {
        const { config, a, b } = bridge.suspension,
          length = config.lengthM;
        const dx = (b.x - a.x) / length,
          dz = (b.z - a.z) / length,
          yaw = Math.atan2(dz, dx);
        const boxes: V2Box[] = [];
        for (const side of [-1, 1]) {
          const lateral = side * (config.widthM / 2 + 0.12);
          for (let i = 1; i < points.length; i++) {
            const p = points[i - 1],
              q = points[i],
              t = (i - 0.5) / (points.length - 1);
            const height = config.railHeightM + (config.towerHeightM * 0.86 - config.railHeightM) * (2 * t - 1) ** 2;
            boxes.push({
              id: `${bridge.id}:rail:${side}:${i}`,
              label: "吊桥护绳",
              center: { x: (p.x + q.x) / 2 - dz * lateral, z: (p.z + q.z) / 2 + dx * lateral },
              sizeX: Math.hypot(q.x - p.x, q.z - p.z),
              sizeZ: 0.044,
              sizeY: 0.044,
              yaw,
              elevation: (p.y + q.y) / 2 + height - 0.022,
              collision: true,
              occlusion: true
            });
          }
        }
        for (const [i, tower] of bridge.suspension.towers.entries())
          boxes.push({
            id: `${bridge.id}:tower:${i}`,
            label: "吊桥立柱",
            center: { x: tower.x, z: tower.z },
            sizeX: BRIDGE_TOWER_WIDTH_M,
            sizeZ: BRIDGE_TOWER_WIDTH_M,
            sizeY: tower.topY - tower.bottomY,
            yaw,
            elevation: tower.bottomY,
            collision: true,
            occlusion: true
          });
        parts.push({ id: bridge.id, layer: "bridge-structure", boxes });
      }
    }
  for (const groupId of new Set(plan.rocks.map((r) => (plan.poiDistribution ? r.id : r.groupId)))) {
    parts.push({
      id: groupId,
      layer: "rock",
      boxes: plan.rocks
        .filter((r) => (plan.poiDistribution ? r.id : r.groupId) === groupId)
        .flatMap(
          (r) =>
            r.boxes ?? [
              {
                id: r.id,
                label: r.id,
                center: r.center,
                sizeX: r.width,
                sizeZ: r.depth,
                sizeY: r.height,
                yaw: r.yaw,
                elevation: r.baseHeight ?? ground(r.center),
                collision: true,
                occlusion: true
              }
            ]
        )
    });
  }
  for (const yard of plan.courtyards ?? []) parts.push({ id: yard.regionId, layer: "building", boxes: yard.fences });
  for (const fence of plan.fences ?? []) parts.push({ id: fence.id, layer: "building", boxes: [fence] });
  for (const b of plan.buildings)
    parts.push({
      id: b.id,
      layer: "building",
      boxes: b.boxes ?? [
        {
          id: b.id,
          label: b.id,
          center: b.center,
          sizeX: b.width,
          sizeZ: b.depth,
          sizeY: b.height,
          yaw: b.yaw,
          elevation: b.baseHeight ?? ground(b.center),
          collision: true,
          occlusion: true
        }
      ]
    });
  for (const p of (plan.landscapes ?? []).filter((p) => !removed.has(p.id)))
    parts.push({
      id: plan.poiDistribution ? p.id : p.ownerId,
      layer: p.kind === "tree" ? "tree" : "landscape-rock",
      boxes:
        p.kind === "tree"
          ? treeWhiteboxes(p, p.baseHeight ?? ground(p.center))
          : [
              {
                id: p.id,
                label: p.kind,
                center: p.center,
                sizeX: p.width,
                sizeZ: p.depth,
                sizeY: p.height,
                yaw: p.yaw,
                elevation: p.baseHeight ?? ground(p.center),
                collision: true,
                occlusion: true
              }
            ]
    });
  return parts.filter((part) => !removed.has(part.id));
}
