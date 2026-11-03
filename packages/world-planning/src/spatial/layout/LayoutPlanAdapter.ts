import { layoutRule } from "./LayoutRules";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { publishRoadPath } from "./RoadGeometry";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import { boxOutline } from "./Volumes";
import { volumeEnvelope, type LayoutGroup } from "./LayoutKernel";

/** Renderer-only bindings. Adding an asset mapping does not add a spatial rule or an exclusion. */
export type LayoutAppearance = "building" | "rock" | "region";
/** Project generic geometry to the existing views and asset adapters; all positions/sizes remain owned by the layout.
 * @param groups Final spatial outputs.
 * @param appearance POI-to-presentation mapping resolved from the same element profile as its default dimensions.
 * @param publishPaths Skip transient path geometry when reusing the complete accepted road publication.
 */
export function projectLayoutGroups(
  plan: IslandPlan,
  groups: readonly LayoutGroup[],
  appearance: Record<string, LayoutAppearance>,
  publishPaths = true
): void {
  plan.buildings = [];
  plan.rocks = [];
  plan.mountains = [];
  plan.plazas = [];
  plan.regions = plan.regions.filter((r) => r.kind === "island");
  plan.planning!.ports = [];
  plan.planning!.modules = plan.planning!.modules.filter((m) => m.kind === "land" || m.kind === "island");
  for (const group of groups) {
    const outline = envelope(group.center, group.rule.radiusM * 2, group.rule.radiusM * 2, 0);
    plan.planning!.modules.push({
      id: group.id,
      kind: "open",
      outline,
      dependencies: [],
      memberIds: [...group.volumes.map((v) => v.id), ...group.paths.map((p) => p.id)],
      requested: {},
      resolved: { count: group.volumes.length }
    });
    if (layoutRule(group.rule.pattern).centerClearing && group.rule.openRadiusM > 0) {
      const radius = group.rule.openRadiusM;
      const approach = group.paths.find(
        (p) => p.from === `${group.id}:center:port` || p.to === `${group.id}:center:port`
      );
      const next = approach?.points[approach.from === `${group.id}:center:port` ? 1 : approach.points.length - 2];
      const heading = next ? Math.atan2(next.z - group.center.z, next.x - group.center.x) : 0;
      plan.plazas.push({
        id: `${group.id}:clearing`,
        label: "中心留白",
        purpose: "central-clearing",
        center: { ...group.center },
        outline: Array.from({ length: 32 }, (_, i) => ({
          x:
            group.center.x +
            Math.cos((i * Math.PI) / 16) *
              radius *
              (0.84 + 0.1 * Math.cos(2 * ((i * Math.PI) / 16 - heading)) + 0.04 * Math.sin((3 * (i * Math.PI)) / 16)),
          z:
            group.center.z +
            Math.sin((i * Math.PI) / 16) *
              radius *
              (0.84 + 0.1 * Math.cos(2 * ((i * Math.PI) / 16 - heading)) + 0.04 * Math.sin((3 * (i * Math.PI)) / 16))
        }))
      });
      plan.planning!.modules.at(-1)!.memberIds!.push(`${group.id}:clearing`);
    }
    for (const v of group.volumes) {
      const primary = v.boxes[0],
        shape = volumeEnvelope(v),
        binding = appearance[group.id] ?? "rock";
      const boxes = v.boxes.map((b, i) => ({
        id: `${v.id}:part:${i}`,
        label: v.id,
        center: b.center,
        sizeX: b.width,
        sizeZ: b.depth,
        sizeY: b.height,
        yaw: b.yaw,
        elevation: b.elevation,
        collision: true,
        occlusion: true
      }));
      if (binding === "building")
        plan.buildings.push({
          id: v.id,
          regionId: group.id,
          ...(boxes.length === 1 ? primary : { ...shape, yaw: 0 }),
          outline: boxes.length === 1 ? boxOutline(primary) : envelope(shape.center, shape.width, shape.depth, 0),
          baseHeight: Math.min(...v.boxes.map((b) => b.elevation)),
          ...(boxes.length > 1 ? { boxes } : {})
        });
      else if (binding === "region")
        plan.regions.push({
          id: v.id,
          label: "空间区域",
          kind: "open",
          outline: envelope(shape.center, shape.width, shape.depth, 0)
        });
      else
        plan.rocks.push({
          id: v.id,
          groupId: group.id,
          center: shape.center,
          width: shape.width,
          depth: shape.depth,
          height: shape.height,
          baseHeight: Math.min(...v.boxes.map((b) => b.elevation)),
          yaw: primary.yaw,
          role: "wall",
          outline: envelope(shape.center, shape.width, shape.depth, 0),
          obb: envelope(shape.center, shape.width, shape.depth, 0),
          boxes
        });
    }
    for (const port of group.ports)
      plan.planning!.ports.push({
        id: port.id,
        ownerId: group.id,
        position: port.position,
        height: 0,
        width: group.rule.pathWidthM,
        kind: "entrance",
        ...(port.access ? { roadAccess: { required: false, poiId: group.id } } : {})
      });
    if (publishPaths)
      for (const route of group.paths) plan.routes.push(publishRoadPath({ ...route, label: "内部通道" }, route.points));
    const site = plan.poiDistribution?.sites.find((s) => s.id === group.id);
    if (site) {
      site.memberIds = group.volumes.map((v) => v.id);
      site.radiusM = group.rule.radiusM;
      site.contentRadiusM = Math.max(
        0,
        ...group.volumes
          .flatMap((v) => v.boxes.flatMap(boxOutline))
          .map((p) => Math.hypot(p.x - site.center.x, p.z - site.center.z))
      );
    }
  }
}
