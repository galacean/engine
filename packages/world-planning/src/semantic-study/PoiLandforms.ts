import { composeRockGroup } from "../landforms/RockComposition";
import { unionRectangles } from "./ComposedShape";
import recipes from "../planning-data/landform-recipes.json";
import { buildLandform, type LandformKind } from "../landforms/Landforms";
import { planningAtomCatalog } from "../landforms/InteractiveLandforms";
import { DEFAULT_LANDFORM_METRICS } from "../landforms/LandformMetrics";
import type { IslandPlan, PlanPoint, PlanRock } from "./IslandPlanModel";
import type { PoiLayoutConfig } from "./PoiDistribution";
import type { SemanticEdit, PlanningCheck } from "./WorldPlanningContract";
import { contains, overlap } from "./WorldPlanningGeometry";
import { envelope } from "./IslandPlanAtoms";
import { settlementRandom } from "./SettlementGeometry";
import { createPlanningGroundSampler, createPlanningRingQuery } from "./WorldPlanningTerrain";

/** Place an atlas-derived landform combination at allocated POI sites.
 * No village/road is moved to make room. Local edits reuse the previous landform poses;
 * a resulting collision is rejected by the shared publication transaction.
 */
export function placePoiLandforms(
  plan: IslandPlan,
  config: PoiLayoutConfig,
  previous?: IslandPlan,
  keepPoses = false,
  edits: Record<string, SemanticEdit> = {}
): void {
  const distribution = plan.poiDistribution!;
  const ground = createPlanningGroundSampler(plan);
  const roles = {
    crown: "peak",
    spire: "peak",
    "crown/spire": "peak",
    wall: "wall",
    "buttress/shoulder": "shoulder",
    "terrace/cap": "terrace",
    "saddle/notch": "shoulder",
    skirt: "skirt",
    mass: "wall"
  } as const;
  const currentSites = new Map(distribution.sites.map((site) => [site.id, site]));
  const oldSites =
    previous?.poiDistribution?.sites
      .filter((p) => {
        const current = currentSites.get(p.id);
        // IDs identify sampling slots, not poses. A global spacing edit can reuse an ID
        // at a different location/tier/domain; that content must pass fresh placement checks.
        return (
          current?.tier === p.tier &&
          current.domainId === p.domainId &&
          current.center.x === p.center.x &&
          current.center.z === p.center.z &&
          p.memberIds.some((id) => previous.mountains.some((m) => m.id === id && m.semanticKind !== "peaks"))
        );
      })
      .map((p) => p.id) ?? [];
  const used = new Set<string>();
  const sites = distribution.sites
    .filter((p) => recipes.recipes.some((r) => r.kind !== "canyon" && r.tiers.includes(p.tier)) && !p.memberIds.length)
    .sort(
      (a, b) =>
        settlementRandom(plan.parameters.seed, a.id + "landform") -
        settlementRandom(plan.parameters.seed, b.id + "landform")
    );
  if (keepPoses) sites.sort((a, b) => Number(oldSites.includes(b.id)) - Number(oldSites.includes(a.id)));
  for (const site of sites) {
    if (plan.mountains.length >= config.content.landformLimit) break;
    const seed = plan.parameters.seed,
      id = `landform-${site.id}`;
    const edit = edits[id] ?? {},
      lengthM = edit.lengthM ?? config.content.landformLengthM,
      heightM = edit.heightM ?? config.content.landformHeightM,
      yawDegrees = edit.yawDegrees ?? settlementRandom(seed, id + "yaw") * 360,
      variation = edit.variation ?? config.content.landformVariation;
    if (
      ![lengthM, heightM, yawDegrees, variation].every(Number.isFinite) ||
      lengthM < 1 ||
      lengthM > 200 ||
      heightM < 0.1 ||
      heightM > 80 ||
      variation < 0 ||
      variation > 1
    )
      throw new Error("地貌参数超出支持范围");
    const eligible = recipes.recipes.filter((r) => r.kind !== "canyon" && r.tiers.includes(site.tier));
    const fresh = eligible.filter((r) => !used.has(r.kind));
    const pool = fresh.length ? fresh : eligible;
    const previousKind =
      keepPoses && oldSites.includes(site.id) ? previous?.mountains.find((m) => m.id === id)?.semanticKind : undefined;
    let value = settlementRandom(seed, site.id + "recipe") * pool.reduce((sum, r) => sum + r.weight, 0);
    const chosen =
      eligible.find((r) => r.kind === previousKind) ?? pool.find((r) => (value -= r.weight) < 0) ?? pool[0];
    if (!chosen) continue;
    const kind = chosen.kind as LandformKind;
    const seconds = lengthM / DEFAULT_LANDFORM_METRICS.walkSpeedMps;
    let form = buildLandform(
      kind,
      {
        [`${kind}Seconds`]: seconds,
        referenceHeightM: heightM
      },
      planningAtomCatalog(),
      { seed: Math.floor(settlementRandom(seed, id) * 0xffffffff), amount: variation }
    );
    if (kind === "plateau" && config.population) {
      const atoms = composeRockGroup(seed, id, {
        lengthM,
        heightM,
        count: 5 + Math.floor(settlementRandom(seed, id + "count") * 4),
        variation,
        plateau: true
      });
      const boxes = atoms.flatMap((a) => a.boxes);
      const outlines = unionRectangles(
        boxes.map((b) => ({
          id: b.id,
          x: b.center.x,
          z: b.center.z,
          width: b.sizeX,
          length: b.sizeZ,
          yaw: (b.yaw * 180) / Math.PI
        })),
        1e-8
      );
      form = { ...form, atoms, boxes, outlines };
    }
    const angle = (yawDegrees * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    const transform = (p: PlanPoint): PlanPoint => ({
      x: site.center.x + c * p.x - s * p.z,
      z: site.center.z + s * p.x + c * p.z
    });
    const base = ground(site.center);
    const rocks: PlanRock[] = form.atoms.map((a, i) => {
      const center = transform({ x: a.x, z: a.z }),
        yaw = a.yaw + angle,
        rockId = `${id}-atom-${i}`;
      const outline = envelope(center, a.width, a.depth, yaw);
      return {
        id: rockId,
        groupId: id,
        center,
        width: a.width,
        depth: a.depth,
        height: a.height,
        baseHeight: base,
        yaw,
        role: roles[a.kind],
        outline,
        obb: outline,
        boxes: a.boxes.map((b, j) => ({
          ...b,
          id: `${rockId}-${j}`,
          center: transform(b.center),
          yaw: b.yaw + angle,
          elevation: base + (b.elevation ?? 0)
        }))
      };
    });
    const domain = distribution.domains.find((d) => d.id === site.domainId)!;
    // Actual constituent footprints protect concavities; no enclosing rectangle is published as solid.
    const footprints = rocks.flatMap((r) => r.boxes!.map((b) => envelope(b.center, b.sizeX, b.sizeZ, b.yaw)));
    const obstacles = [
      ...plan.buildings.map((b) => b.outline),
      ...plan.routes.map((r) => r.outline!),
      ...plan.rocks.map((r) => r.outline),
      ...plan.waters.map((w) => w.outline)
    ];
    if (
      !(keepPoses && oldSites.includes(site.id)) &&
      footprints.some((r) => !contains(domain.outline, r) || obstacles.some((o) => overlap(r, o)))
    )
      continue;
    const outlines = form.outlines.map((r) => r.map(transform));
    plan.rocks.push(...rocks);
    plan.mountains.push({
      id,
      semanticKind: kind,
      label: `${chosen.label} ${plan.mountains.length + 1}`,
      outline: outlines[0],
      outlines,
      semanticOutlines: outlines,
      densityOutlines: outlines,
      rockIds: rocks.map((r) => r.id)
    });
    plan.planning!.modules.push({
      id,
      kind: "mountain",
      outline: outlines[0],
      outlines,
      dependencies: [site.id],
      memberIds: rocks.map((r) => r.id),
      requested: { lengthM, heightM, yawDegrees, variation },
      resolved: {
        originX: site.center.x,
        originZ: site.center.z,
        height: Math.max(...rocks.map((r) => r.height)),
        obbCount: form.boxes.length
      }
    });
    site.memberIds.push(id);
    used.add(kind);
  }
  if (plan.mountains.length < config.content.landformLimit)
    plan.planning!.adjustments.push({
      owners: [],
      requested: config.content.landformLimit,
      resolved: plan.mountains.length,
      reason: "部分地貌在当前 POI 点没有足够空间；未移动村庄或道路"
    });
}

/** Check actual landform occupancy independently of candidate placement. */
export function validatePoiContents(plan: IslandPlan): PlanningCheck[] {
  if (!plan.poiDistribution) return [];
  const obstacles = [...plan.buildings.map((b) => b.outline), ...plan.routes.map((r) => r.outline!)];
  const domains = plan.poiDistribution.domains.map((d) => createPlanningRingQuery(d.outline));
  const good = plan.rocks.every((r) =>
    (r.boxes ?? []).every((b) => {
      const ring = envelope(b.center, b.sizeX, b.sizeZ, b.yaw);
      return (
        domains.some((d) => d.containsPolygon(ring)) &&
        !obstacles.some((o) => overlap(ring, o)) &&
        !plan.rocks.some(
          (other) =>
            other.groupId !== r.groupId &&
            (other.boxes ?? []).some((ob) => overlap(ring, envelope(ob.center, ob.sizeX, ob.sizeZ, ob.yaw)))
        )
      );
    })
  );
  const watersGood = plan.waters.every((w) => {
    const profile = plan.planning?.profiles.find((p) => p.ownerId === w.id && p.kind === "water");
    return (
      domains.some(
        (d) =>
          d.containsPolygon(w.outline) ||
          (w.to === "ocean" &&
            w.centerline?.length &&
            w.outline.every(
              (p) =>
                d.inside(p) ||
                Math.hypot(p.x - w.centerline!.at(-1)!.x, p.z - w.centerline!.at(-1)!.z) <=
                  Math.max(...(w.widths ?? [0])) * 2
            ))
      ) &&
      ![...plan.buildings.map((b) => b.outline), ...plan.rocks.map((r) => r.outline)].some((o) =>
        overlap(w.outline, o)
      ) &&
      plan.routes.every((route) => !route.outline || !overlap(route.outline, w.outline)) &&
      !!profile?.points.length &&
      profile.points.every((p, i) => i === 0 || p.y <= profile.points[i - 1].y)
    );
  });
  return [
    {
      id: "poi-water-occupancy",
      rule: "POI02",
      owners: plan.waters.map((w) => w.id),
      required: true,
      status: watersGood ? "pass" : "fail",
      message: watersGood
        ? "河流保持下坡、位于陆域内并避让实体；跨河道路有完整桥面支撑"
        : "河流约束未通过：检查河道是否越过陆域、与实体/道路重叠，或高度剖面未保持下坡"
    },
    {
      id: "poi-landform-occupancy",
      rule: "POI01",
      owners: plan.mountains.map((m) => m.id),
      required: true,
      status: good ? "pass" : "fail",
      message: good
        ? "地貌实际 OBB 在陆域内，避让村庄和道路"
        : "地貌占地约束未通过：实际 OBB 越过陆域，或与村庄、道路、其他地貌重叠"
    }
  ];
}
