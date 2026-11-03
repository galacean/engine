import { resolveParameters } from "./ParameterScopes";
import { composeCanyonBanks } from "../landforms/CanyonBanks";
import { compileRockAtom } from "../landforms/RockAtoms";
import { planningAtomCatalog } from "../landforms/InteractiveLandforms";
import { DEFAULT_LANDFORM_METRICS } from "../landforms/LandformMetrics";
import recipes from "../planning-data/landform-recipes.json";
import type { IslandPlan, PlanPoint, PlanRock } from "./IslandPlanModel";
import type { PoiLayoutConfig } from "./PoiDistribution";
import type { SemanticEdit } from "./WorldPlanningContract";
import { envelope } from "./IslandPlanAtoms";
import { contains, overlap } from "./WorldPlanningGeometry";
import { ribbonOutline } from "./WorldRibbon";
import { riverSectionWidths } from "./WorldLayoutWater";
import { settlementRandom as random, settlementBounds } from "./SettlementGeometry";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";

export type { CanyonConfig } from "./CanyonParameters";
import { validateCanyonParameters, type CanyonConfig } from "./CanyonParameters";
/** One continuous seeded cubic curve drives both banks and the channel. No fixed branch topology. */
export function canyonAxis(seed: number, id: string, q: CanyonConfig): PlanPoint[] {
  const a = (random(seed, id + "handle-a") * 2 - 1) * q.bend * q.lengthM * 0.45;
  const b = (random(seed, id + "handle-b") * 2 - 1) * q.bend * q.lengthM * 0.45;
  return Array.from({ length: 33 }, (_, i) => {
    const t = i / 32,
      u = 1 - t;
    return { x: (t - 0.5) * q.lengthM, z: 3 * u * u * t * a + 3 * u * t * t * b };
  });
}
export function placePoiCanyons(plan: IslandPlan, config: PoiLayoutConfig, edits: Record<string, SemanticEdit>): void {
  const ground = createPlanningGroundSampler(plan),
    seed = plan.parameters.seed;
  let count = 0;
  const sites = plan.poiDistribution!.sites.filter(
    (s) => recipes.recipes.some((r) => r.kind === "canyon" && r.tiers.includes(s.tier)) && !s.memberIds.length
  );
  const primary = sites.map((site) => ({ site, scale: 1, yawOffset: 0 }));
  const fitting = sites.flatMap((site) =>
    recipes.canyonFit.scales.flatMap((scale) =>
      recipes.canyonFit.yawOffsetsDegrees
        .filter((yawOffset) => scale !== 1 || yawOffset !== 0)
        .map((yawOffset) => ({ site, scale, yawOffset }))
    )
  );
  // Preserve the authored canyon's site first; otherwise retain the original full-size placement pass.
  const authored = (site: (typeof sites)[number]) => Object.keys(edits[`landform-${site.id}`]?.canyon ?? {}).length > 0;
  const candidates = [
    ...primary.filter((p) => authored(p.site)),
    ...fitting.filter((p) => authored(p.site)),
    ...primary.filter((p) => !authored(p.site)),
    ...fitting.filter((p) => !authored(p.site))
  ];
  for (const { site, scale, yawOffset } of candidates) {
    if (count >= config.content.canyonLimit || plan.mountains.length >= config.content.landformLimit) break;
    if (site.memberIds.length) continue;
    const id = `landform-${site.id}`,
      edit = edits[id] ?? {},
      requested = resolveParameters(config.canyon, edit.canyon);
    validateCanyonParameters(requested as unknown as Record<string, unknown>);
    const q = {
      ...requested,
      lengthM: requested.lengthM * scale,
      floorWidthM: requested.floorWidthM * scale,
      bankWidthM: requested.bankWidthM * scale,
      riverWidthM: requested.riverWidthM * scale
    };
    // Fitting never bypasses channel clearance or the supported physical size range.
    try {
      validateCanyonParameters(q as unknown as Record<string, unknown>);
    } catch {
      continue;
    }
    const requestedYaw = edit.yawDegrees ?? random(seed, id + "yaw") * 360;
    const yaw = ((requestedYaw + yawOffset) * Math.PI) / 180,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const axis = canyonAxis(seed, id, q).map((p) => ({
      x: site.center.x + c * p.x - s * p.z,
      z: site.center.z + s * p.x + c * p.z
    }));
    const waterId = `${id}-river`,
      widths = riverSectionWidths(axis, q.riverWidthM, q.widthVariation, random(seed, id + "width") * Math.PI * 2);
    const water = {
      id: waterId,
      systemId: id,
      label: "峡谷河流",
      kind: "river" as const,
      centerline: axis,
      widths: axis.map((_, i) => widths[i] ?? widths.at(-1)!),
      outline: ribbonOutline(axis, widths, { start: "butt", end: "butt" }, true),
      from: `${waterId}-source`,
      to: `${waterId}-outlet`
    };
    const catalog = planningAtomCatalog();
    const atoms = composeCanyonBanks({
      lengthM: q.lengthM,
      pitchM: DEFAULT_LANDFORM_METRICS.walkSpeedMps * DEFAULT_LANDFORM_METRICS.atomExposureSeconds,
      // floorWidthM denotes the narrow part; the atlas throat is .6 of its spread.
      spreadM: q.floorWidthM / 0.6,
      bankWidthM: q.bankWidthM,
      variation: config.content.landformVariation,
      frame(t) {
        const u = t * (axis.length - 1),
          i = Math.min(axis.length - 2, Math.floor(u)),
          a = axis[i],
          b = axis[i + 1];
        return {
          position: { x: a.x + (b.x - a.x) * (u - i), z: a.z + (b.z - a.z) * (u - i) },
          yaw: Math.atan2(b.z - a.z, b.x - a.x)
        };
      }
    });
    const rocks: PlanRock[] = atoms.map((a, i) => {
      const rockId = `${id}-bank-${a.side}-${i}`,
        baseHeight = ground(a.center);
      const atom = compileRockAtom(
        {
          id: rockId,
          kind: a.kind,
          x: a.center.x,
          z: a.center.z,
          yaw: a.yaw,
          baseY: baseHeight,
          width: a.width,
          depth: a.depth,
          height: q.heightM * a.heightScale * (a.kind === "buttress/shoulder" ? 0.55 : 1)
        },
        catalog
      );
      const outline = envelope(a.center, a.width, a.depth, a.yaw);
      return {
        id: rockId,
        groupId: id,
        center: a.center,
        width: a.width,
        depth: a.depth,
        height: atom.height,
        yaw: a.yaw,
        baseHeight,
        role: a.kind === "buttress/shoulder" ? "shoulder" : a.kind === "terrace/cap" ? "terrace" : "wall",
        outline,
        obb: outline,
        boxes: atom.boxes
      };
    });
    const domain = plan.poiDistribution!.domains.find((d) => d.id === site.domainId)!;
    const footprints = [water.outline, ...rocks.map((r) => r.outline)];
    const obstacles = [
      ...plan.regions.filter((r) => r.kind === "village").map((r) => r.outline),
      ...plan.routes.map((r) => r.outline!),
      ...plan.rocks.map((r) => r.outline),
      ...plan.waters.map((w) => w.outline)
    ];
    const valid =
      footprints.every((r) => contains(domain.outline, r) && !obstacles.some((o) => overlap(r, o))) &&
      !rocks.some((r) => overlap(r.outline, water.outline));
    // A historical edit record is not a demand to abort the entire new world at this candidate.
    if (!valid) continue;
    if (scale !== 1 || yawOffset !== 0)
      plan.planning!.adjustments.push({
        owners: [id],
        requested: 1,
        resolved: scale,
        reason: `峡谷占地按可用空间适配；朝向 ${requestedYaw.toFixed(1)}° → ${(requestedYaw + yawOffset).toFixed(1)}°，保留水陆及占地约束`
      });
    const floor = Math.min(...axis.map(ground)) - 1,
      fall = Math.min(1, q.lengthM * 0.003);
    plan.waters.push(water);
    plan.rocks.push(...rocks);
    const outlines = rocks.map((r) => r.outline);
    plan.mountains.push({
      id,
      semanticKind: "canyon",
      label: `峡谷 ${count + 1}`,
      outline: settlementBounds(footprints.flat()),
      outlines,
      rockIds: rocks.map((r) => r.id)
    });
    plan.planning!.modules.push({
      id,
      kind: "mountain",
      outline: plan.mountains.at(-1)!.outline,
      outlines,
      dependencies: [site.id],
      memberIds: [...rocks.map((r) => r.id), waterId],
      requested: { ...requested, yawDegrees: requestedYaw },
      resolved: {
        ...q,
        yawDegrees: (yaw * 180) / Math.PI,
        originX: site.center.x,
        originZ: site.center.z,
        height: q.heightM,
        obbCount: rocks.reduce((sum, r) => sum + r.boxes!.length, 0)
      }
    });
    for (const kind of ["water", "bed"] as const)
      plan.planning!.profiles.push({
        id: `${waterId}-${kind}`,
        ownerId: waterId,
        kind,
        points: axis.map((p, i) => ({ ...p, y: floor - (fall * i) / (axis.length - 1) - (kind === "bed" ? 1.5 : 0) })),
        width: q.riverWidthM,
        supportIds: [id]
      });
    for (const [position, portId, i] of [
      [axis[0], water.from, 0],
      [axis.at(-1)!, water.to, 1]
    ] as const)
      plan.planning!.ports.push({
        id: portId,
        ownerId: id,
        kind: "water",
        position,
        height: floor - fall * i,
        width: q.riverWidthM,
        surfaceId: waterId
      });
    site.memberIds.push(id);
    count++;
  }
  for (const [id, edit] of Object.entries(edits))
    if (
      edit.canyon &&
      Object.keys(edit.canyon).length &&
      !plan.mountains.some((m) => m.id === id && m.semanticKind === "canyon")
    )
      plan.planning!.adjustments.push({
        owners: [id],
        requested: 1,
        resolved: 0,
        reason: "此点位的峡谷在当前布局中无可行占地，局部参数已保留；本次未生成该峡谷"
      });
  if (count < config.content.canyonLimit)
    plan.planning!.adjustments.push({
      owners: [],
      requested: config.content.canyonLimit,
      resolved: count,
      reason: "大型 POI 的可用空间不足，未强塞峡谷"
    });
}
