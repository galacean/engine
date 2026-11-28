import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { PlanningModule, SemanticEdit, SemanticParameters, SemanticResult } from "./WorldPlanningContract";

/** Unchecked geometry for immediate input feedback; it must never be added to accepted history. */
export interface PlanningGeometryDraft {
  plan: IslandPlan;
  changedIds: string[];
  description: string;
}
/** The specific control whose visible geometry response is being timed. */
export interface PlanningPreviewTarget {
  moduleId?: string;
  parameter: string;
}

/** Ignore unrelated objects, requested values, labels and audit metadata when timing a control. */
export function planningGeometrySignature(plan: IslandPlan, target: PlanningPreviewTarget): string {
  const sorted = <T extends { id: string }>(values: T[]) => [...values].sort((a, b) => a.id.localeCompare(b.id));
  const rocks = (owner?: string) =>
    sorted(plan.rocks.filter((r) => (owner ? r.groupId === owner : !r.groupId.startsWith("offshore-")))).map((r) => [
      r.id,
      r.outline,
      r.obb
    ]);
  const buildings = (owner?: string) =>
    sorted(plan.buildings.filter((b) => !owner || b.regionId === owner)).map((b) => [b.id, b.outline]);
  const water = (owner?: string, descendants = false) =>
    sorted(
      plan.waters.filter(
        (w) => !owner || w.id === owner || w.systemId === owner || (descendants && w.id.startsWith(`${owner}-branch-`))
      )
    ).map((w) => [w.id, w.outline]);
  const mountains = () => [
    sorted(plan.mountains.filter((m) => !m.offshore)).map((m) => [m.id, m.outlines ?? m.outline]),
    rocks()
  ];
  const routes = () => sorted(plan.routes).map((r) => [r.id, r.outline ?? [r.points, r.width]]);
  const villages = () => [
    sorted(plan.regions.filter((r) => r.kind === "village")).map((r) => [r.id, r.outline, r.navigationArea]),
    buildings()
  ];
  const islands = () => [
    plan.islands,
    sorted(plan.rocks.filter((r) => r.groupId.startsWith("offshore-"))).map((r) => [r.id, r.outline])
  ];
  const { moduleId, parameter } = target;
  if (moduleId) {
    const module = plan.planning?.modules.find((m) => m.id === moduleId),
      kind = module?.kind;
    if (parameter === "height")
      return plan.landformStudy
        ? JSON.stringify(plan.rocks.filter((r) => r.groupId === moduleId).map((r) => r.boxes))
        : "[]"; // Height labels are not a changed two-dimensional footprint.
    if (kind === "water") return JSON.stringify(water(moduleId, parameter === "branches"));
    if (kind === "routes" || moduleId === "routes") return JSON.stringify(routes());
    if (kind === "village" || kind === "teleport")
      return JSON.stringify(
        parameter === "density"
          ? buildings(moduleId)
          : plan.regions.filter((r) => r.id === moduleId).map((r) => [r.outline, r.navigationArea])
      );
    if (kind === "mountain")
      return JSON.stringify([
        rocks(moduleId),
        plan.mountains.filter((m) => m.id === moduleId).map((m) => m.outlines ?? m.outline)
      ]);
    if (moduleId === "land-main") return JSON.stringify(plan.land);
    return JSON.stringify(module?.outline ?? []);
  }
  switch (parameter) {
    case "landCoverage":
      return JSON.stringify(plan.land);
    case "islandRichness":
    case "offshoreCoverage":
      return JSON.stringify(islands());
    case "openness":
      return JSON.stringify(plan.planning?.modules.find((m) => m.kind === "open")?.outlines ?? []);
    case "terrainRichness":
      return JSON.stringify(mountains());
    case "waterRichness":
      return JSON.stringify(water());
    case "villageRichness":
      return JSON.stringify(villages());
    case "routeLoops":
      return JSON.stringify(routes());
    case "complexity":
      return JSON.stringify(plan.land);
    default:
      return JSON.stringify([plan.land, islands(), mountains(), water(), villages(), routes()]);
  }
}

interface Deformation {
  point(point: PlanPoint): PlanPoint;
  scale: number;
  height: number;
  width: number;
  angle: number;
}
const midpoint = (points: PlanPoint[]): PlanPoint => {
  if (!points.length) return { x: 0, z: 0 };
  let lowX = Infinity,
    highX = -Infinity,
    lowZ = Infinity,
    highZ = -Infinity;
  for (const p of points) {
    lowX = Math.min(lowX, p.x);
    highX = Math.max(highX, p.x);
    lowZ = Math.min(lowZ, p.z);
    highZ = Math.max(highZ, p.z);
  }
  return { x: (lowX + highX) / 2, z: (lowZ + highZ) / 2 };
};
const relative = (value: number | undefined, initial: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : initial;

/** Derive immediate size, height, width, bend and direction drafts from accepted primitives.
 * Counts, topology and collision repairs are deliberately left to the complete worker pipeline.
 * @returns A separate geometry graph with no valid checks, or null when no geometric shortcut applies.
 */
export function previewWorldGeometry(
  accepted: SemanticResult,
  parameters: SemanticParameters,
  edits: Record<string, SemanticEdit>
): PlanningGeometryDraft | null {
  const base = accepted.plan,
    deformations = new Map<string, Deformation>();
  const globalCoverage = Math.sqrt(
    Math.max(0.01, parameters.landCoverage) / Math.max(0.01, accepted.recipe.parameters.landCoverage)
  );
  for (const module of base.planning?.modules ?? []) {
    // A connected system needs the authoritative water stage to move lake, reaches and mouths together.
    if (module.kind === "valley" || (module.kind === "water" && module.memberIds && module.memberIds.length > 1))
      continue;
    const edit = edits[module.id] ?? {},
      old = accepted.recipe.edits[module.id] ?? {};
    const read = (key: keyof SemanticEdit, fallback: number): [number, number] => [
      relative(edit[key] as number | undefined, fallback),
      relative(old[key] as number | undefined, fallback)
    ];
    const [size, oldSize] = read("size", 1),
      [height, oldHeight] = read("height", 1),
      [width, oldWidth] = read("width", 1),
      [direction, oldDirection] = read("direction", 0),
      [bend, oldBend] = read("bend", 0.5);
    const scale =
        (!base.landformStudy && module.kind !== "water"
          ? Math.sqrt(size / Math.max(0.01, oldSize))
          : size / Math.max(0.01, oldSize)) * (module.kind === "land" ? globalCoverage : 1),
      heightScale = height / Math.max(0.01, oldHeight),
      widthScale = width / Math.max(0.01, oldWidth),
      angle = (direction - oldDirection) * Math.PI;
    const opening = 0;
    if (
      Math.abs(scale - 1) < 1e-8 &&
      Math.abs(heightScale - 1) < 1e-8 &&
      Math.abs(widthScale - 1) < 1e-8 &&
      Math.abs(angle) < 1e-8 &&
      Math.abs(bend - oldBend) < 1e-8 &&
      Math.abs(opening) < 1e-8
    )
      continue;
    const source = base.shapeRecipes?.find((shape) => shape.id === module.id);
    const pivot = Number.isFinite(module.resolved.originX)
      ? { x: module.resolved.originX, z: module.resolved.originZ }
      : source?.blocks.length
        ? midpoint(source.blocks.map((block) => ({ x: block.x, z: block.z })))
        : midpoint(module.outline);
    const water = base.waters.find((w) => w.id === module.id);
    const channel = water?.centerline;
    const cosine = Math.cos(angle),
      sine = Math.sin(angle);
    let shift = { x: 0, z: 0 };
    if (opening) {
      const river = base.waters.find((w) => w.kind === "river" && w.centerline?.length);
      const near = river?.centerline?.length
        ? nearest(pivot, river.centerline).point
        : { x: base.parameters.width / 2, z: base.parameters.depth / 2 };
      const distance = Math.hypot(pivot.x - near.x, pivot.z - near.z) || 1;
      shift = { x: ((pivot.x - near.x) / distance) * opening, z: ((pivot.z - near.z) / distance) * opening };
    }
    const deformation: Deformation = {
      scale,
      height: heightScale * (base.landformStudy ? scale : 1),
      width: widthScale,
      angle,
      point(p) {
        let x = p.x,
          z = p.z;
        if (channel && channel.length > 1 && (widthScale !== 1 || bend !== oldBend)) {
          const near = nearest(p, channel),
            first = channel[0],
            last = channel[channel.length - 1],
            t = near.t;
          const line = { x: first.x + (last.x - first.x) * t, z: first.z + (last.z - first.z) * t };
          let warped = near.point;
          if (bend !== oldBend) {
            if (oldBend > 0.001) {
              const ratio = bend / oldBend;
              warped = { x: line.x + (near.point.x - line.x) * ratio, z: line.z + (near.point.z - line.z) * ratio };
            } else {
              const dx = last.x - first.x,
                dz = last.z - first.z,
                length = Math.hypot(dx, dz) || 1,
                offset = Math.sin(Math.PI * t) * Math.sin(Math.PI * 2 * t) * Math.min(110, length * 0.2) * bend;
              warped = { x: near.point.x - (dz / length) * offset, z: near.point.z + (dx / length) * offset };
            }
          }
          x = warped.x + (p.x - near.point.x) * widthScale;
          z = warped.z + (p.z - near.point.z) * widthScale;
        } else if (widthScale !== 1 && module.kind !== "routes") x = pivot.x + (x - pivot.x) * widthScale;
        const dx = (x - pivot.x) * scale,
          dz = (z - pivot.z) * scale;
        return { x: pivot.x + dx * cosine - dz * sine + shift.x, z: pivot.z + dx * sine + dz * cosine + shift.z };
      }
    };
    deformations.set(module.id, deformation);
  }
  if (!deformations.size) return null;
  const transform = (id: string, p: PlanPoint) => deformations.get(id)?.point(p) ?? p;
  const ring = (id: string, points: PlanPoint[]) =>
    deformations.has(id) ? points.map((p) => transform(id, p)) : points;
  const waterOwner = (id: string) => base.waters.find((w) => id === `bank-${w.id}`)?.id;
  const regionForIsland = base.regions.filter((region) => region.kind === "island");
  const plan: IslandPlan = {
    ...base,
    land: ring("land-main", base.land),
    islands: base.islands.map((points, i) => ring(regionForIsland[i]?.id ?? `offshore-${i}`, points)),
    rocks: base.rocks.map((rock) => {
      const change = deformations.get(rock.groupId);
      return change
        ? {
            ...rock,
            center: change.point(rock.center),
            outline: ring(rock.groupId, rock.outline),
            obb: ring(rock.groupId, rock.obb),
            width: rock.width * change.scale,
            depth: rock.depth * change.scale,
            height: rock.height * change.height,
            yaw: rock.yaw + change.angle,
            boxes: rock.boxes?.map((b) => ({
              ...b,
              center: change.point(b.center),
              sizeX: b.sizeX * change.scale,
              sizeZ: b.sizeZ * change.scale,
              sizeY: b.sizeY * change.height,
              yaw: b.yaw + change.angle,
              elevation: (rock.baseHeight ?? 0) + ((b.elevation ?? 0) - (rock.baseHeight ?? 0)) * change.height
            }))
          }
        : rock;
    }),
    mountains: base.mountains.map((group) =>
      deformations.has(group.id)
        ? {
            ...group,
            semanticOutlines: group.semanticOutlines?.map((points) => ring(group.id, points)),
            densityOutlines: group.densityOutlines?.map((points) => ring(group.id, points)),
            outline: ring(group.id, group.outline),
            outlines: group.outlines?.map((points) => ring(group.id, points)),
            landform: group.landform
              ? {
                  ...group.landform,
                  outline: ring(group.id, group.landform.outline),
                  outlines: group.landform.outlines?.map((points) => ring(group.id, points)),
                  ridge: group.landform.ridge.map((p) => ({
                    ...transform(group.id, p),
                    height: p.height * (deformations.get(group.id)?.height ?? 1)
                  })),
                  width: group.landform.width * (deformations.get(group.id)?.scale ?? 1)
                }
              : undefined
          }
        : group
    ),
    structures: base.structures?.map((s) => {
      const owner = s.bankIds.find((id) => deformations.has(id));
      if (!owner) return s;
      const change = deformations.get(owner)!;
      return {
        ...s,
        axis: s.axis.map(change.point),
        outlet: change.point(s.outlet),
        outline: ring(owner, s.outline),
        floor: ring(owner, s.floor),
        waterDomain: s.waterDomain ? { ...s.waterDomain, outline: ring(owner, s.waterDomain.outline) } : undefined,
        sections: s.sections?.map((v) => ({ ...v, center: change.point(v.center), width: v.width * change.scale }))
      };
    }),
    waters: base.waters.map((water) =>
      deformations.has(water.id)
        ? {
            ...water,
            outline: ring(water.id, water.outline),
            centerline: water.centerline?.map((p) => transform(water.id, p))
          }
        : water
    ),
    regions: base.regions.map((region) =>
      deformations.has(region.id)
        ? {
            ...region,
            outline: ring(region.id, region.outline),
            navigationArea: region.navigationArea ? ring(region.id, region.navigationArea) : undefined
          }
        : region
    ),
    buildings: base.buildings.map((building) => {
      const change = deformations.get(building.regionId);
      return change
        ? {
            ...building,
            center: change.point(building.center),
            outline: ring(building.regionId, building.outline),
            width: building.width * change.scale,
            depth: building.depth * change.scale,
            yaw: building.yaw + change.angle
          }
        : building;
    }),
    places: base.places.map((place) => {
      const owner = base.regions.find((region) => place.id.startsWith(`${region.id}-`))?.id;
      return owner && deformations.has(owner)
        ? { ...place, center: transform(owner, place.center), outline: ring(owner, place.outline) }
        : place;
    }),
    routes: base.routes.map((route) => {
      const change = deformations.get("routes");
      if (!change) return route;
      const outline = route.outline?.map((point) => {
        const center = nearest(point, route.points).point;
        return { x: center.x + (point.x - center.x) * change.width, z: center.z + (point.z - center.z) * change.width };
      });
      return {
        ...route,
        width: route.width * change.width,
        maxWidth: route.maxWidth === undefined ? undefined : route.maxWidth * change.width,
        outline
      };
    }),
    ridges: base.ridges.map((ridge) =>
      deformations.has(ridge.groupId) ? { ...ridge, points: ring(ridge.groupId, ridge.points) } : ridge
    ),
    slopes: base.slopes.map((slope) => {
      const owner = slope.id === "coast-soil" ? "land-main" : waterOwner(slope.id);
      return owner && deformations.has(owner)
        ? { ...slope, outer: ring(owner, slope.outer), inner: ring(owner, slope.inner) }
        : slope;
    }),
    shapeRecipes: base.shapeRecipes?.map((shape) => {
      const change =
        deformations.get(shape.id) ??
        (base.routes.some((route) => route.shapeRecipeId === shape.id) ? deformations.get("routes") : undefined);
      return change
        ? {
            ...shape,
            rounding: shape.rounding * change.scale,
            blocks: shape.blocks.map((block) => {
              const p = change.point({ x: block.x, z: block.z });
              return {
                ...block,
                ...p,
                width: block.width * change.scale * change.width,
                length: block.length * change.scale,
                yaw: block.yaw + (change.angle * 180) / Math.PI
              };
            })
          }
        : shape;
    }),
    planning: base.planning
      ? {
          ...base.planning,
          status: "invalid",
          checks: [],
          ports: base.planning.ports.map((port) =>
            deformations.has(port.ownerId) ? { ...port, position: transform(port.ownerId, port.position) } : port
          ),
          modules: base.planning.modules.map((module) =>
            deformations.has(module.id)
              ? {
                  ...module,
                  outline: ring(module.id, module.outline),
                  outlines: module.outlines?.map((points) => ring(module.id, points))
                }
              : module
          ),
          reservations: base.planning.reservations.map((reservation) =>
            deformations.has(reservation.ownerId)
              ? { ...reservation, outline: ring(reservation.ownerId, reservation.outline) }
              : reservation
          )
        }
      : undefined
  };
  return { plan, changedIds: [...deformations.keys()], description: "局部形态草稿 · 关联约束未检查" };
}

function nearest(point: PlanPoint, points: PlanPoint[]): { point: PlanPoint; t: number } {
  let best = Infinity,
    near = points[0],
    t = 0,
    total = 0;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    lengths.push(total);
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b.x - a.x,
      dz = b.z - a.z,
      u = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1))),
      p = { x: a.x + dx * u, z: a.z + dz * u },
      distance = (point.x - p.x) ** 2 + (point.z - p.z) ** 2;
    if (distance < best) {
      best = distance;
      near = p;
      t = (lengths[i - 1] + (lengths[i] - lengths[i - 1]) * u) / (total || 1);
    }
  }
  return { point: near, t };
}

/** Merge completed authoritative stages over the accepted map without clearing unfinished modules.
 * The combined display remains a draft: omitted or stale downstream objects wait for the final transaction.
 */
export function mergePlanningStage(base: IslandPlan | undefined, partial: IslandPlan, stage: string): IslandPlan {
  if (!base || partial.planning?.auditMode === "paused")
    return {
      ...partial,
      planning: partial.planning ? { ...partial.planning, status: "invalid", checks: [] } : undefined
    };
  const index =
    ({ domain: 0, water: 1, places: 2, open: 2.5, landforms: 3, lookout: 3.5, routes: 4 } as Record<string, number>)[
      stage
    ] ?? -1;
  if (index < 0)
    return {
      ...partial,
      planning: partial.planning ? { ...partial.planning, status: "invalid", checks: [] } : undefined
    };
  const done = new Set<PlanningModule["kind"]>(["land", "island"]);
  if (index >= 1) {
    done.add("water");
  }
  if (index >= 2) {
    done.add("village");
  }
  if (index >= 2.5) done.add("open");
  if (index >= 3) done.add("mountain");
  if (index >= 3.5) done.add("teleport");
  if (index >= 4) {
    done.add("routes");
    done.add("visual");
    done.add("spawn");
  }
  const merge = <T extends { id: string }>(older: T[], newer: T[]): T[] => {
    const ids = new Set(newer.map((v) => v.id));
    return [...older.filter((v) => !ids.has(v.id)), ...newer];
  };
  const merged: IslandPlan = {
    ...base,
    ...partial,
    rocks:
      index >= 3
        ? partial.rocks
        : [...base.rocks.filter((rock) => !rock.groupId.startsWith("offshore-")), ...partial.rocks],
    mountains: index >= 3 ? partial.mountains : base.mountains,
    waters: index >= 1 ? partial.waters : base.waters,
    regions:
      index >= 2 ? partial.regions : [...base.regions.filter((region) => region.kind !== "island"), ...partial.regions],
    buildings: index >= 2 ? partial.buildings : base.buildings,
    places: index >= 2 ? partial.places : base.places,
    routes: index >= 4 ? partial.routes : merge(base.routes, partial.routes),
    bridges: index >= 4 ? partial.bridges : base.bridges,
    sights: index >= 4 ? partial.sights : base.sights,
    ridges: index >= 4 ? partial.ridges : base.ridges,
    supports: index >= 4 ? partial.supports : base.supports,
    spawn: index >= 4 ? partial.spawn : base.spawn,
    slopes: partial.slopes.length ? partial.slopes : base.slopes,
    shapeRecipes: merge(base.shapeRecipes ?? [], partial.shapeRecipes ?? []),
    planning: partial.planning
      ? {
          ...partial.planning,
          status: "invalid",
          checks: [],
          modules: [
            ...(base.planning?.modules ?? []).filter((module) => !done.has(module.kind)),
            ...partial.planning.modules.filter((module) => module.kind !== "valley")
          ]
        }
      : undefined
  };
  return preserveStageContours(base, merged, partial);
}

/** Keep matching rectangle sources at their displayed detail; refine only changed stage sources. */
function preserveStageContours(base: IslandPlan, merged: IslandPlan, partial: IslandPlan): IslandPlan {
  const incoming = new Set((partial.shapeRecipes ?? []).map((s) => s.id));
  if (!incoming.size) return merged;
  const plan = structuredClone(merged),
    oldShapes = new Map((base.shapeRecipes ?? []).map((s) => [s.id, s]));
  for (const shape of plan.shapeRecipes ?? []) {
    if (!incoming.has(shape.id) || plan.routes.some((r) => r.id === shape.id || r.shapeRecipeId === shape.id)) continue;
    const old = oldShapes.get(shape.id);
    if (!old || JSON.stringify([old.blocks, old.rounding]) !== JSON.stringify([shape.blocks, shape.rounding])) {
      continue;
    }
    let outline: PlanPoint[] | undefined;
    if (shape.id === "land-main") {
      plan.land = structuredClone(base.land);
      outline = plan.land;
    }
    const oldWater = base.waters.find((w) => w.id === shape.id),
      water = plan.waters.find((w) => w.id === shape.id);
    if (oldWater && water) {
      water.outline = structuredClone(oldWater.outline);
      outline = water.outline;
    }
    const oldRegion = base.regions.find((r) => r.id === shape.id),
      region = plan.regions.find((r) => r.id === shape.id);
    if (oldRegion && region) {
      region.outline = structuredClone(oldRegion.outline);
      region.navigationArea = structuredClone(oldRegion.navigationArea);
      outline = region.outline;
      if (region.kind === "island") {
        const index = plan.regions.filter((r) => r.kind === "island").findIndex((r) => r.id === region.id);
        if (index >= 0) plan.islands[index] = region.outline;
      }
    }
    const oldMountain = base.mountains.find((m) => m.id === shape.id),
      mountain = plan.mountains.find((m) => m.id === shape.id);
    if (oldMountain && mountain) {
      mountain.outline = structuredClone(oldMountain.outline);
      mountain.outlines = structuredClone(oldMountain.outlines);
      outline = mountain.outline;
    }
    if (outline) {
      const module = plan.planning?.modules.find((m) => m.id === shape.id);
      if (module) module.outline = outline;
      shape.contourDetail = old.contourDetail;
      shape.resolvedContourBase = structuredClone(old.resolvedContourBase);
    }
  }
  return plan;
}

/** Build an interruptible display-only transition between two real layouts.
 * Stable IDs retain identity. Intermediate polygons are not checked snapshots and must not be exported.
 * @returns A sampler with exact source/destination endpoints and independently owned intermediate geometry.
 */
export function createPlanningTransition(from: IslandPlan, to: IslandPlan): (progress: number) => IslandPlan {
  type RecordValue = Record<string, unknown>;
  type Sampler = (t: number) => unknown;
  const pointKeys = new Set(["center", "position", "a", "b", "from", "to"]);
  const ringKeys = new Set(["outline", "outer", "inner", "obb", "points", "centerline", "navigationArea"]);
  const numbers = new Set([
    "x",
    "z",
    "y",
    "width",
    "depth",
    "length",
    "height",
    "baseHeight",
    "startHeight",
    "endHeight",
    "thickness",
    "yaw",
    "spread",
    "sizeX",
    "sizeY",
    "sizeZ",
    "elevation"
  ]);
  const isPoint = (v: unknown): v is PlanPoint =>
    !!v && typeof v === "object" && typeof (v as PlanPoint).x === "number" && typeof (v as PlanPoint).z === "number";
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const pointSampler =
    (a: PlanPoint, b: PlanPoint): Sampler =>
    (t) => ({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
  const area = (ring: PlanPoint[]) =>
    ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p.x * q.z - q.x * p.z;
    }, 0);
  const resample = (ring: PlanPoint[], count: number, closed: boolean): PlanPoint[] => {
    const edges = closed ? ring.length : Math.max(0, ring.length - 1),
      lengths = [0];
    for (let i = 0; i < edges; i++)
      lengths.push(
        lengths[i] + Math.hypot(ring[(i + 1) % ring.length].x - ring[i].x, ring[(i + 1) % ring.length].z - ring[i].z)
      );
    const length = lengths.at(-1) ?? 0;
    if (!length) return Array.from({ length: count }, () => ({ ...ring[0] }));
    let edge = 0;
    return Array.from({ length: count }, (_, i) => {
      const d = (length * i) / (closed ? count : Math.max(1, count - 1));
      while (edge < edges - 1 && lengths[edge + 1] < d) edge++;
      const a = ring[edge],
        b = ring[(edge + 1) % ring.length],
        t = (d - lengths[edge]) / (lengths[edge + 1] - lengths[edge] || 1);
      return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) };
    });
  };
  const ringSampler = (a: PlanPoint[] | undefined, b: PlanPoint[] | undefined, closed: boolean): Sampler => {
    if (JSON.stringify(a) === JSON.stringify(b)) return () => b;
    const target = b?.length ? b : (a ?? []),
      origin = a?.length ? a : (b ?? []);
    if (!target.length) return () => [];
    const count = Math.min(384, Math.max(origin.length, target.length, closed ? 3 : 2));
    const aa = resample(origin, count, closed),
      bb = resample(target, count, closed);
    if (!a?.length) {
      const center = midpoint(target);
      aa.forEach((p) => Object.assign(p, center));
    }
    if (!b?.length) {
      const center = midpoint(origin);
      bb.forEach((p) => Object.assign(p, center));
    }
    if (closed && a?.length && b?.length) {
      if (area(aa) * area(bb) < 0) bb.reverse();
      let start = 0,
        best = Infinity;
      bb.forEach((p, i) => {
        const d = (p.x - aa[0].x) ** 2 + (p.z - aa[0].z) ** 2;
        if (d < best) {
          best = d;
          start = i;
        }
      });
      bb.push(...bb.splice(0, start));
    }
    return (t) => aa.map((p, i) => ({ x: lerp(p.x, bb[i].x, t), z: lerp(p.z, bb[i].z, t) }));
  };
  const objectSampler = (a: RecordValue | undefined, b: RecordValue | undefined): Sampler => {
    const template = b ?? a ?? {},
      old = a ?? template,
      changes = new Map<string, Sampler>();
    for (const key of Object.keys(template)) {
      const aa = old[key],
        bb = template[key];
      if (pointKeys.has(key) && isPoint(aa) && isPoint(bb)) changes.set(key, pointSampler(aa, bb));
      else if (ringKeys.has(key) && Array.isArray(bb))
        changes.set(
          key,
          ringSampler(
            a ? (aa as PlanPoint[]) : undefined,
            b ? (bb as PlanPoint[]) : undefined,
            key !== "points" && key !== "centerline"
          )
        );
      else if (key === "outlines" && Array.isArray(bb)) {
        const older = (aa ?? []) as PlanPoint[][],
          newer = bb as PlanPoint[][];
        const rings = Array.from({ length: Math.max(older.length, newer.length) }, (_, i) =>
          ringSampler(a ? older[i] : undefined, b ? newer[i] : undefined, true)
        );
        changes.set(key, (t) => rings.map((sample) => sample(t)));
      } else if (numbers.has(key) && typeof aa === "number" && typeof bb === "number")
        changes.set(key, (t) => lerp(aa, bb, t));
    }
    return (t) => {
      const value = { ...template };
      for (const [key, sample] of changes) value[key] = sample(t);
      return value;
    };
  };
  const listSampler = <T extends { id: string }>(a: T[], b: T[]): Sampler => {
    const old = new Map(a.map((v) => [v.id, v])),
      next = new Map(b.map((v) => [v.id, v]));
    const samplers = [...b, ...a.filter((v) => !next.has(v.id))].map((v) =>
      objectSampler(old.get(v.id) as RecordValue | undefined, next.get(v.id) as RecordValue | undefined)
    );
    return (t) => samplers.map((sample) => sample(t));
  };
  const land = ringSampler(from.land, to.land, true),
    spawn = pointSampler(from.spawn, to.spawn);
  const islandIds = (plan: IslandPlan) => plan.regions.filter((r) => r.kind === "island").map((r) => r.id);
  const oldIslandIds = islandIds(from),
    newIslandIds = islandIds(to);
  const islands = listSampler(
    from.islands.map((outline, i) => ({ id: oldIslandIds[i] ?? `island-${i}`, outline })),
    to.islands.map((outline, i) => ({ id: newIslandIds[i] ?? `island-${i}`, outline }))
  );
  const keys = [
    "rocks",
    "mountains",
    "waters",
    "regions",
    "buildings",
    "routes",
    "bridges",
    "sights",
    "ridges",
    "supports",
    "slopes",
    "places"
  ] as const;
  const lists = new Map(
    keys.map((key) => [key, listSampler(from[key] as { id: string }[], to[key] as { id: string }[])])
  );
  const modules = listSampler(from.planning?.modules ?? [], to.planning?.modules ?? []),
    ports = listSampler(from.planning?.ports ?? [], to.planning?.ports ?? []),
    reservations = listSampler(from.planning?.reservations ?? [], to.planning?.reservations ?? []);
  return (progress) => {
    if (progress <= 0) return from;
    if (progress >= 1) return to;
    const plan = {
      ...to,
      land: land(progress) as PlanPoint[],
      spawn: spawn(progress) as PlanPoint,
      islands: (islands(progress) as { outline: PlanPoint[] }[]).map((v) => v.outline)
    };
    for (const [key, sample] of lists) (plan as unknown as RecordValue)[key] = sample(progress);
    if (to.planning)
      plan.planning = {
        ...to.planning,
        status: "invalid",
        checks: [],
        modules: modules(progress) as PlanningModule[],
        ports: ports(progress) as typeof to.planning.ports,
        reservations: reservations(progress) as typeof to.planning.reservations
      };
    return plan;
  };
}
