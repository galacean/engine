import { waterGeometry, carveWater } from "./V2WaterGeometry";
import { createGlobalRecipe } from "./V2GlobalLayout";
import { V2_SURFACE_CHANNELS } from "./V2SurfaceLayers";
import type {
  WorldRecipe,
  WorldSnapshot,
  V2RandomProfile,
  V2CompileResult,
  V2Budget,
  V2Point,
  V2Point3,
  V2WaterSurface,
  V2Heightfield,
  V2Road,
  V2PlacedBox,
  V2Box,
  V2Bounds,
  ValidationReport
} from "../spatial/V2Model.ts";
import {
  clamp,
  smooth5,
  hashText,
  namedRandom,
  distance,
  nearestSegment,
  polygonDistance,
  isSimplePolygon,
  triangulatePolygon,
  curveLine,
  resampleLine,
  ribbon,
  sampleHeight,
  sampleSlope,
  sampleMesh,
  distanceToWater,
  distanceToBox,
  pointInPolygon,
  segmentPolygonDistance,
  boxFootprint,
  terrainRange
} from "./V2Geometry";
import { V2Meter, V2BudgetExceeded, DEFAULT_V2_BUDGET } from "./V2Budget";
import { validateWithMeter, buildSights, buildTargetSight, validateDataSafety } from "./V2Validation";
import { buildExperience } from "./V2Experience";
import { buildRouteLandforms } from "./V2RouteLandforms";
export { DEFAULT_V2_BUDGET } from "./V2Budget";
export { validateSnapshot } from "./V2Validation";

/** Initial proposal ranges; direct authoring can exceed these intervals. */
export const DEFAULT_V2_PROFILE: V2RandomProfile = {
  id: "temperate-study",
  label: "宽缓河谷",
  elevation: [35, 95],
  riverWidth: [22, 38],
  meander: [40, 85],
  boxHeight: [10, 26],
  roughness: [2, 5]
};
/** Create a deterministic editable scene using named independent draws. @param seed World seed. @param profile Proposal ranges, separate from input validity. @returns Serializable intent. */
export function createRecipe(seed: number, profile: V2RandomProfile = DEFAULT_V2_PROFILE): WorldRecipe {
  return createGlobalRecipe(seed, profile);
}
/** Verified-recovery intent with flat dry ground and no physical obstacles. @param seed Identity of the request being recovered. @returns A separate, explicitly reduced recipe. */
export function createSafeRecipe(seed: number): WorldRecipe {
  const recipe = createRecipe(seed);
  recipe.global = undefined;
  recipe.resolution = 513;
  recipe.elevations = [];
  recipe.rivers = [];
  recipe.riverNodes = [];
  recipe.lakes = [];
  recipe.boxes = [];
  recipe.canyons = [];
  recipe.roughness = 0;
  recipe.views = [];
  recipe.groups = [];
  recipe.pois = recipe.pois.slice(0, 2);
  recipe.routes = recipe.pois.map((poi, index) => ({
    id: `safe-road-${index}`,
    label: `恢复动线 ${index + 1}`,
    from: index ? recipe.pois[index - 1].id : "spawn",
    to: poi.id,
    width: 6,
    maxSlope: 0.7,
    bendPenalty: 1
  }));
  return recipe;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function positionOf(recipe: WorldRecipe, id: string): V2Point | undefined {
  return id === "spawn"
    ? recipe.spawn
    : (recipe.routeNodes?.find((node) => node.id === id)?.position ?? recipe.pois.find((p) => p.id === id)?.position);
}
function finiteTree(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteTree);
  if (value && typeof value === "object") return Object.values(value).every(finiteTree);
  return true;
}
function requireInput(input: WorldRecipe, meter: V2Meter): string | null {
  if (!input || input.version !== 2 || input.algorithm !== "layout-2.0") return "unsupported:不支持的数据或算法版本";
  if (!finiteTree(input)) return "invalid-input:参数必须为有限数值";
  if (
    !Number.isInteger(input.seed) ||
    !Number.isFinite(input.size) ||
    input.size < 64 ||
    input.size > 8192 ||
    !Number.isInteger(input.resolution) ||
    input.resolution < 33 ||
    input.resolution > 513
  )
    return "invalid-input:世界范围为 64–8192 米，采样分辨率为 33–513 个顶点";
  for (const key of [
    "elevations",
    "riverNodes",
    "rivers",
    "lakes",
    "canyons",
    "boxes",
    "pois",
    "routes",
    "views"
  ] as const)
    if (!Array.isArray(input[key]) || input[key].length > (key === "boxes" ? 2048 : 512))
      return `invalid-input:${key} 需要有界对象数组`;
  const all = [
    ...input.elevations,
    ...input.riverNodes,
    ...input.rivers,
    ...input.lakes,
    ...input.canyons,
    ...input.boxes,
    ...input.pois,
    ...(input.routeNodes ?? []),
    ...input.routes,
    ...input.views,
    ...(input.groups || [])
  ];
  const ids = new Set<string>();
  for (const item of all) {
    meter.spend();
    if (!item.id || item.id === "spawn" || ids.has(item.id)) return "invalid-input:对象 ID 为空或重复";
    ids.add(item.id);
  }
  if (
    !(input.riverScale > 0) ||
    !(input.noiseScale > 0) ||
    input.roughness < 0 ||
    !input.player ||
    input.player.radius <= 0 ||
    input.player.maxSlope <= 0 ||
    input.player.eyeHeight <= 0 ||
    input.player.speed <= 0
  )
    return "invalid-input:宽度、噪声尺度与角色参数需要正值";
  const bound = input.size / 2;
  const point = (p: V2Point | undefined) =>
    p && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) < bound && Math.abs(p.z) < bound;
  if (!point(input.spawn)) return "proved-conflict:出生点超出世界范围";
  for (const e of input.elevations)
    if (
      !point(e.center) ||
      e.radiusX <= 0 ||
      e.radiusZ <= 0 ||
      e.plateau < 0 ||
      e.plateau >= 1 ||
      e.roughness < 0 ||
      (e.outline && (e.outline.length > 128 || !e.outline.every(point) || !isSimplePolygon(e.outline)))
    )
      return "invalid-input:抬升域需要正半径、[0,1) 平台比例和简单多边形";
  for (const lake of input.lakes)
    if (
      !point(lake.center) ||
      lake.radiusX <= 0 ||
      lake.radiusZ <= 0 ||
      lake.depth <= 0 ||
      lake.irregularity < 0 ||
      lake.irregularity > 0.45 ||
      (lake.outline && (lake.outline.length > 128 || !lake.outline.every(point) || !isSimplePolygon(lake.outline)))
    )
      return "invalid-input:湖泊轮廓、半径或深度无效";
  for (const node of input.riverNodes) if (!point(node)) return "proved-conflict:河流节点超出世界范围";
  for (const river of input.rivers) {
    const from = input.riverNodes.find((n) => n.id === river.from),
      to = input.riverNodes.find((n) => n.id === river.to);
    if (!from || !to || from.id === to.id) return "invalid-input:河段需要两个不同的已存在连接节点";

    if (
      !Array.isArray(river.controls) ||
      river.controls.length > 64 ||
      !river.controls.every(point) ||
      river.width <= 0 ||
      river.widthEnd <= 0 ||
      river.depth <= 0 ||
      river.bankWidth < 0
    )
      return "invalid-input:河段控制点、宽度或深度无效";
    if (
      river.widthSamples &&
      (river.widthSamples.length > 64 ||
        river.widthSamples.some((w, i, a) => w.t < 0 || w.t > 1 || w.width <= 0 || (i > 0 && w.t <= a[i - 1].t)))
    )
      return "invalid-input:沿程宽度样本应按 0–1 弧长递增且宽度为正";
  }
  for (const c of input.canyons)
    if (
      !Array.isArray(c.points) ||
      c.points.length < 2 ||
      c.points.length > 64 ||
      !c.points.every(point) ||
      c.width <= 0 ||
      c.shoulder < 0 ||
      c.depth < 0
    )
      return "invalid-input:切割曲线或宽度无效";
  for (const b of input.boxes)
    if (!point(b.center) || b.sizeX <= 0 || b.sizeY <= 0 || b.sizeZ <= 0 || Math.max(b.sizeX, b.sizeZ) >= input.size)
      return "invalid-input:占位体尺寸或位置无效";
  for (const p of input.pois)
    if (
      !point(p.position) ||
      p.radius <= 0 ||
      p.markerHeight <= 0 ||
      (p.markerWidth !== undefined && p.markerWidth <= 0)
    )
      return "invalid-input:POI 位置和尺度无效";
  for (const r of input.routes)
    if (
      !positionOf(input, r.from) ||
      !positionOf(input, r.to) ||
      r.from === r.to ||
      r.width <= 0 ||
      r.maxSlope <= 0 ||
      r.maxSlope > input.player.maxSlope ||
      (r.controls && !r.controls.every(point)) ||
      (r.pointHeights && r.pointHeights.length !== (r.controls?.length ?? 0) + 2) ||
      (r.pointElevations && r.pointElevations.length !== (r.controls?.length ?? 0) + 2) ||
      (r.pointSupportIds &&
        (r.pointSupportIds.length !== (r.controls?.length ?? 0) + 2 ||
          r.pointSupportIds.some((id) => id && !input.boxes.some((box) => box.id === id)))) ||
      (r.supportBoxIds && r.supportBoxIds.some((id) => !input.boxes.some((box) => box.id === id)))
    )
      return "invalid-input:动线端点、宽度或坡度阈值无效";
  for (const v of input.views)
    if (
      !positionOf(input, v.from) ||
      (!positionOf(input, v.target) &&
        !input.boxes.some((b) => b.id === v.target) &&
        !input.lakes.some((lake) => lake.id === v.target) &&
        !input.rivers.some((river) => river.id === v.target)) ||
      v.minimum < 0 ||
      v.maximum > 1 ||
      v.minimum > v.maximum
    )
      return "invalid-input:视线参与对象或阈值无效";
  if (input.views.some((view) => view.target === "spawn"))
    return "unsupported:出生点本身没有可见实体，视线目标需要引用 POI 地标或白盒";
  if (input.earthworks && (!(input.earthworks.maxCutFill >= 0) || !(input.earthworks.shoulder >= 0)))
    return "invalid-input:道路挖填预算与过渡宽度不可为负";
  const transformable = new Set(
    [
      ...input.elevations,
      ...input.riverNodes,
      ...input.rivers,
      ...input.lakes,
      ...input.canyons,
      ...input.boxes,
      ...input.pois,
      ...(input.routeNodes ?? [])
    ].map((item) => item.id)
  );
  const grouped = new Set<string>();
  for (const g of input.groups || []) {
    if (g.scale <= 0 || !Array.isArray(g.memberIds)) return "invalid-input:组合缩放和成员引用无效";
    for (const id of g.memberIds) {
      if (grouped.has(id)) return "unsupported:同一对象的多重组合归属尚不支持";
      if (!ids.has(id)) return "invalid-input:组合引用了不存在的对象";
      if (!transformable.has(id)) return "unsupported:组合成员需要引用可变换的几何对象，不能引用关系或嵌套组合";
      grouped.add(id);
    }
  }
  return null;
}

/** Apply group transforms without mutating authored primitives. @param source Recipe with optional group transforms. @returns Resolved recipe consumed by both compiler and validator. */
export function resolveRecipe(source: WorldRecipe): WorldRecipe {
  const recipe = clone(source);
  for (const group of recipe.groups || []) {
    const point = (p: V2Point) => {
      const x = (p.x - group.pivot.x) * group.scale,
        z = (p.z - group.pivot.z) * group.scale;
      return {
        x: group.pivot.x + x * Math.cos(group.yaw) - z * Math.sin(group.yaw) + group.translation.x,
        z: group.pivot.z + x * Math.sin(group.yaw) + z * Math.cos(group.yaw) + group.translation.z
      };
    };
    const members = new Set(group.memberIds);
    for (const e of recipe.elevations)
      if (members.has(e.id)) {
        e.center = point(e.center);
        e.radiusX *= group.scale;
        e.radiusZ *= group.scale;
        e.height *= group.scale;
        e.yaw += group.yaw;
        if (e.outline) e.outline = e.outline.map(point);
      }
    for (const l of recipe.lakes)
      if (members.has(l.id)) {
        l.center = point(l.center);
        l.radiusX *= group.scale;
        l.radiusZ *= group.scale;
        l.depth *= group.scale;
        l.yaw += group.yaw;
        if (l.outline) l.outline = l.outline.map(point);
      }
    for (const b of recipe.boxes)
      if (members.has(b.id)) {
        b.center = point(b.center);
        b.sizeX *= group.scale;
        b.sizeY *= group.scale;
        if (b.elevation !== undefined) b.elevation *= group.scale;
        b.sizeZ *= group.scale;
        b.yaw += group.yaw;
      }
    for (const c of recipe.canyons)
      if (members.has(c.id)) {
        c.points = c.points.map(point);
        c.width *= group.scale;
        c.depth *= group.scale;
        c.shoulder *= group.scale;
      }
    for (const p of recipe.pois)
      if (members.has(p.id)) {
        p.position = point(p.position);
        p.outline = p.outline?.map(point);
        p.entrances?.forEach((entrance) => (entrance.position = point(entrance.position)));
        p.activityAreas?.forEach((area) => (area.outline = area.outline.map(point)));
        p.slots?.forEach((slot) => {
          slot.center = point(slot.center);
          slot.sizeX *= group.scale;
          slot.sizeY *= group.scale;
          slot.sizeZ *= group.scale;
          slot.yaw += group.yaw;
        });
        p.radius *= group.scale;
        p.markerHeight *= group.scale;
        if (p.markerWidth) p.markerWidth *= group.scale;
      }
    for (const node of recipe.routeNodes ?? [])
      if (members.has(node.id)) {
        node.position = point(node.position);
        if (node.radius) node.radius *= group.scale;
        node.slots?.forEach((slot) => {
          slot.center = point(slot.center);
          slot.sizeX *= group.scale;
          slot.sizeY *= group.scale;
          slot.sizeZ *= group.scale;
          slot.yaw += group.yaw;
        });
      }
    for (const route of recipe.routes) {
      const ownsRoute = route.sourceFeatureIds?.includes(group.id);
      route.controls = route.controls?.map((p, i) =>
        ownsRoute || members.has(route.pointSupportIds?.[i + 1] ?? "") ? point(p) : p
      );
      route.pointHeights = route.pointHeights?.map((height, i) =>
        ownsRoute || members.has(route.pointSupportIds?.[i] ?? "") ? height * group.scale : height
      );
      route.pointElevations = route.pointElevations?.map((height, i) =>
        ownsRoute || members.has(route.pointSupportIds?.[i] ?? "") ? height * group.scale : height
      );
    }
    for (const n of recipe.riverNodes)
      if (members.has(n.id)) {
        const p = point(n);
        n.x = p.x;
        n.z = p.z;
      }
    for (const r of recipe.rivers)
      if (members.has(r.id)) {
        r.controls = r.controls.map(point);
        r.width *= group.scale;
        r.widthEnd *= group.scale;
        r.depth *= group.scale;
        r.bankWidth *= group.scale;
        r.widthSamples?.forEach((w) => (w.width *= group.scale));
      }
  }
  recipe.groups = [];
  return recipe;
}

function noise(seed: number, x: number, z: number): number {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    tx = smooth5(x - ix),
    tz = smooth5(z - iz);
  const h = (a: number, b: number) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ seed;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) / 4294967295) * 2 - 1;
  };
  return (
    (h(ix, iz) * (1 - tx) + h(ix + 1, iz) * tx) * (1 - tz) + (h(ix, iz + 1) * (1 - tx) + h(ix + 1, iz + 1) * tx) * tz
  );
}
function fbm(seed: number, x: number, z: number): number {
  return (
    noise(seed, x, z) * 0.58 +
    noise(seed + 41, x * 2, z * 2) * 0.27 +
    noise(seed + 97, x * 4, z * 4) * 0.11 +
    noise(seed + 127, x * 8, z * 8) * 0.04
  );
}
function terrainBase(recipe: WorldRecipe, x: number, z: number, meter: V2Meter): number {
  const g = recipe.global;
  let h = recipe.baseHeight + recipe.roughness * fbm(recipe.seed, x / recipe.noiseScale, z / recipe.noiseScale);
  if (g) {
    h = recipe.baseHeight + g.detail * fbm(recipe.seed, x / 110, z / 110);
  }
  for (const e of recipe.elevations) {
    meter.spend();
    const dx = x - e.center.x,
      dz = z - e.center.z,
      c = Math.cos(e.yaw),
      s = Math.sin(e.yaw);
    const d = e.outline
      ? 1 + polygonDistance({ x, z }, e.outline) / Math.min(e.radiusX, e.radiusZ)
      : Math.hypot((dx * c + dz * s) / e.radiusX, (-dx * s + dz * c) / e.radiusZ);
    h += smooth5((1 - d) / (1 - e.plateau)) * e.height;
  }
  for (const c of recipe.canyons) {
    if (!c.depth) continue;
    let d = Infinity;
    for (let i = 1; i < c.points.length; i++) {
      meter.spend();
      d = Math.min(d, nearestSegment({ x, z }, c.points[i - 1], c.points[i]).distance);
    }
    h -= c.depth * (1 - smooth5((d - c.width / 2) / Math.max(0.001, c.shoulder)));
  }
  return h;
}
// Broad regional support remains a small fraction of the rock silhouette height.
const MOUNTAIN_TERRAIN_INFLUENCE = { heightRatio: 0.12, radiusRatio: { near: 0.18, middle: 0.32, far: 0.48 } };
function applyMountainFoundations(
  recipe: WorldRecipe,
  groups: WorldRecipe["groups"],
  field: V2Heightfield,
  meter: V2Meter
): void {
  const byId = new Map(recipe.boxes.map((box) => [box.id, box]));
  const influences = (groups ?? []).flatMap((group) => {
    const members = group.memberIds
      .map((id) => byId.get(id))
      .filter(
        (box): box is V2Box =>
          !!box && (box.appearance === "rock" || box.appearance === "platform" || box.band !== undefined)
      );
    if (!members.length) return [];
    const x = group.pivot.x + group.translation.x,
      z = group.pivot.z + group.translation.z;
    const distanceFromSpawn = Math.hypot(x - recipe.spawn.x, z - recipe.spawn.z);
    const band =
      group.band ??
      (distanceFromSpawn < recipe.size * 0.22 ? "near" : distanceFromSpawn < recipe.size * 0.4 ? "middle" : "far");
    const radius = recipe.size * MOUNTAIN_TERRAIN_INFLUENCE.radiusRatio[band];
    const height = Math.max(...members.map((box) => box.sizeY)) * MOUNTAIN_TERRAIN_INFLUENCE.heightRatio;
    return [{ x, z, radius, height }];
  });
  const uplift = (x: number, z: number): number => {
    let weight = 0,
      elevation = 0;
    for (const influence of influences) {
      meter.spend();
      const d = Math.hypot(x - influence.x, z - influence.z) / influence.radius;
      const w = smooth5(1 - d);
      weight += w;
      elevation += w * influence.height;
    }
    // Normalized overlapping fields form regional relief without stacking a peak under every rock.
    return elevation / Math.max(1, weight);
  };
  const r = field.resolution,
    cell = field.size / (r - 1),
    half = field.size / 2;
  for (let z = 0; z < r; z++)
    for (let x = 0; x < r; x++) field.heights[z * r + x] += uplift(x * cell - half, z * cell - half);
}

function reserveStoppingAreas(
  recipe: WorldRecipe,
  field: V2Heightfield,
  waters: V2WaterSurface[],
  meter: V2Meter
): void {
  const step = field.size / (field.resolution - 1),
    half = field.size / 2;
  const sites = [
    { id: "spawn", position: recipe.spawn, radius: recipe.player.radius + step },
    // A place boundary is not a request to flatten its entire neighbourhood.
    // Only legacy stopping disks carry that terrain-editing meaning.
    ...recipe.pois.filter((poi) => !poi.outline && !poi.supportBoxId)
  ];
  for (const site of sites) {
    const core = site.radius + step * 1.5,
      transition = Math.max(step * 3, core),
      outer = core + transition;
    meter.spend(waters.reduce((sum, w) => sum + w.outline.length, 0));
    if (distanceToWater(waters, site.position) <= core + step) continue;
    const level =
      site.id === "spawn" && recipe.spawn.elevation !== undefined
        ? recipe.spawn.elevation
        : sampleHeight(field, site.position.x, site.position.z);
    const minX = clamp(Math.floor((site.position.x - outer + half) / step), 0, field.resolution - 1),
      maxX = clamp(Math.ceil((site.position.x + outer + half) / step), 0, field.resolution - 1);
    const minZ = clamp(Math.floor((site.position.z - outer + half) / step), 0, field.resolution - 1),
      maxZ = clamp(Math.ceil((site.position.z + outer + half) / step), 0, field.resolution - 1);
    for (let iz = minZ; iz <= maxZ; iz++)
      for (let ix = minX; ix <= maxX; ix++) {
        meter.spend();
        const x = ix * step - half,
          z = iz * step - half,
          d = Math.hypot(x - site.position.x, z - site.position.z);
        const weight = 1 - smooth5((d - core) / transition),
          idx = iz * field.resolution + ix;
        if (weight > 0 && sampleMeshUnion(waters, x, z) === null)
          field.heights[idx] = field.heights[idx] * (1 - weight) + level * weight;
      }
  }
}
function sampleMeshUnion(waters: V2WaterSurface[], x: number, z: number): number | null {
  for (const w of waters) {
    const level = sampleMesh(w.mesh, x, z);
    if (level !== null) return level;
  }
  return null;
}
function reserveBoxes(recipe: WorldRecipe, waters: V2WaterSurface[], meter: V2Meter, adjusted: string[]): void {
  const step = recipe.size / (recipe.resolution - 1),
    sites = [{ id: "spawn", position: recipe.spawn, radius: step }, ...recipe.pois];
  const safe = (box: WorldRecipe["boxes"][number], p: V2Point) => {
    meter.spend(sites.length + waters.reduce((sum, w) => sum + w.outline.length, 0));
    const radius = Math.hypot(box.sizeX, box.sizeZ) / 2;
    return (
      Math.max(Math.abs(p.x), Math.abs(p.z)) + radius < recipe.size / 2 &&
      distanceToWater(waters, p) > radius &&
      sites.every((site) => distance(p, site.position) > radius + site.radius + step * 1.5)
    );
  };
  for (const box of recipe.boxes) {
    if (!box.collision || box.locked || safe(box, box.center)) continue;
    const original = { ...box.center },
      radius = Math.hypot(box.sizeX, box.sizeZ) / 2,
      candidates: V2Point[] = [];
    for (const site of sites) {
      const d = radius + site.radius + step * 1.6;
      for (let i = 0; i < 24; i++)
        candidates.push({
          x: site.position.x + Math.cos((i * Math.PI) / 12) * d,
          z: site.position.z + Math.sin((i * Math.PI) / 12) * d
        });
    }
    candidates.sort((a, b) => distance(a, original) - distance(b, original));
    const selected = candidates.find((p) => safe(box, p));
    if (selected) {
      box.center = selected;
      adjusted.push(`${box.id}: 为出生/停留通廊保留空间，白盒平移 ${distance(selected, original).toFixed(1)} 米`);
    }
  }
}

function groundBoxes(recipe: WorldRecipe, field: V2Heightfield, meter: V2Meter): V2PlacedBox[] {
  return recipe.boxes.map((b) => {
    const terrainBottom = () => terrainRange(field, boxFootprint(b), (count) => meter.spend(count)).min - 0.05;
    const baseY =
      b.elevation === undefined
        ? terrainBottom()
        : b.appearance === "rock" && !b.locked && b.elevation <= 0
          ? Math.min(b.elevation, terrainBottom())
          : b.elevation;
    // Grounded authored rocks extend down to rolling ground while preserving their intended top silhouette.
    const sizeY = b.sizeY + (b.elevation === undefined ? 0 : b.elevation - baseY);
    return { ...b, sizeY, baseY, y: baseY + sizeY / 2 };
  });
}

class Heap {
  values: { id: number; score: number }[] = [];
  push(id: number, score: number): void {
    const v = { id, score };
    this.values.push(v);
    let i = this.values.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.values[p].score <= score) break;
      this.values[i] = this.values[p];
      i = p;
    }
    this.values[i] = v;
  }
  pop(): number {
    const first = this.values[0],
      end = this.values.pop()!;
    if (this.values.length) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.values.length && this.values[c + 1].score < this.values[c].score) c++;
        if (this.values[c].score >= end.score) break;
        this.values[i] = this.values[c];
        i = c;
      }
      this.values[i] = end;
    }
    return first.id;
  }
}
function gradeRoad(
  recipe: WorldRecipe,
  request: WorldRecipe["routes"][number],
  points: V2Point[],
  field: V2Heightfield,
  meter: V2Meter
): V2Point3[] {
  const limit = recipe.earthworks?.maxCutFill ?? 32,
    grade = Math.min(request.maxSlope, recipe.player.maxSlope) * 0.6;
  const flat = points.map((p) => sampleHeight(field, p.x, p.z));
  if (Math.max(...flat) - Math.min(...flat) < 0.0001) return points.map((p, i) => ({ ...p, y: flat[i] }));
  const heights = flat,
    lower = heights.map((h) => h - limit),
    upper = heights.map((h) => h + limit);
  lower[0] = upper[0] = heights[0];
  lower[lower.length - 1] = upper[upper.length - 1] = heights[heights.length - 1];
  for (let i = 1; i < points.length; i++) {
    meter.spend();
    const step = distance(points[i], points[i - 1]) * grade;
    lower[i] = Math.max(lower[i], lower[i - 1] - step);
    upper[i] = Math.min(upper[i], upper[i - 1] + step);
  }
  for (let i = points.length - 2; i >= 0; i--) {
    meter.spend();
    const step = distance(points[i], points[i + 1]) * grade;
    lower[i] = Math.max(lower[i], lower[i + 1] - step);
    upper[i] = Math.min(upper[i], upper[i + 1] + step);
  }
  if (lower.some((lo, i) => lo > upper[i] + 1e-6))
    throw new Error(`not-found-within-budget:动线 ${request.label} 的固定端点、坡度与挖填范围在当前通廊上没有共同解`);
  const centerline: V2Point3[] = points.map((p, i) => ({ ...p, y: heights[i] }));
  for (let i = 1; i < points.length; i++) {
    const step = distance(points[i], points[i - 1]) * grade;
    centerline[i].y = clamp(
      heights[i],
      Math.max(lower[i], centerline[i - 1].y - step),
      Math.min(upper[i], centerline[i - 1].y + step)
    );
  }
  const r = field.resolution,
    cell = field.size / (r - 1),
    half = field.size / 2,
    core = request.width / 2 + recipe.player.radius + cell * 1.5,
    shoulder = recipe.earthworks?.shoulder ?? cell * 3,
    outer = core + shoulder;
  const x0 = clamp(Math.floor((Math.min(...points.map((p) => p.x)) - outer + half) / cell), 0, r - 1),
    x1 = clamp(Math.ceil((Math.max(...points.map((p) => p.x)) + outer + half) / cell), 0, r - 1);
  const z0 = clamp(Math.floor((Math.min(...points.map((p) => p.z)) - outer + half) / cell), 0, r - 1),
    z1 = clamp(Math.ceil((Math.max(...points.map((p) => p.z)) + outer + half) / cell), 0, r - 1);
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const p = { x: x * cell - half, z: z * cell - half };
      let nearest = Infinity,
        target = 0;
      for (let i = 1; i < centerline.length; i++) {
        meter.spend();
        const a = centerline[i - 1],
          b = centerline[i];
        if (
          p.x < Math.min(a.x, b.x) - outer ||
          p.x > Math.max(a.x, b.x) + outer ||
          p.z < Math.min(a.z, b.z) - outer ||
          p.z > Math.max(a.z, b.z) + outer
        )
          continue;
        const q = nearestSegment(p, a, b);
        if (q.distance < nearest) {
          nearest = q.distance;
          target = a.y + (b.y - a.y) * q.t;
        }
      }
      if (nearest > outer) continue;
      const weight = 1 - smooth5((nearest - core) / Math.max(cell, shoulder)),
        id = z * r + x;
      field.heights[id] = field.heights[id] * (1 - weight) + target * weight;
    }
  return centerline;
}
function drapeRoad(raw: V2Road["mesh"], field: V2Heightfield, meter: V2Meter): V2Road["mesh"] {
  const mesh = { positions: [] as number[], indices: [] as number[] },
    cell = field.size / (field.resolution - 1),
    half = field.size / 2;
  const cross = (a: V2Point, b: V2Point, p: V2Point) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  const clip = (subject: V2Point[], boundary: V2Point[]) => {
    let output = subject;
    for (let i = 0; i < 3; i++) {
      const a = boundary[i],
        b = boundary[(i + 1) % 3],
        input = output;
      output = [];
      for (let j = 0; j < input.length; j++) {
        const p = input[j],
          q = input[(j + 1) % input.length],
          dp = cross(a, b, p),
          dq = cross(a, b, q),
          pin = dp >= -1e-7,
          qin = dq >= -1e-7;
        if (pin) output.push(p);
        if (pin !== qin) {
          const t = dp / (dp - dq);
          output.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
        }
      }
      if (!output.length) break;
    }
    return output;
  };
  for (let i = 0; i < raw.indices.length; i += 3) {
    const p = raw.indices.slice(i, i + 3).map((id) => ({ x: raw.positions[id * 3], z: raw.positions[id * 3 + 2] }));
    const x0 = clamp(Math.floor((Math.min(...p.map((v) => v.x)) + half) / cell), 0, field.resolution - 2),
      x1 = clamp(Math.floor((Math.max(...p.map((v) => v.x)) + half) / cell), 0, field.resolution - 2);
    const z0 = clamp(Math.floor((Math.min(...p.map((v) => v.z)) + half) / cell), 0, field.resolution - 2),
      z1 = clamp(Math.floor((Math.max(...p.map((v) => v.z)) + half) / cell), 0, field.resolution - 2);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const a = { x: x * cell - half, z: z * cell - half },
          b = { x: a.x + cell, z: a.z },
          c = { x: a.x, z: a.z + cell },
          d = { x: a.x + cell, z: a.z + cell };
        for (const triangle of [
          [a, b, c],
          [b, d, c]
        ]) {
          meter.spend(24);
          const polygon = clip(p, triangle);
          if (polygon.length < 3) continue;
          const offset = mesh.positions.length / 3;
          for (const v of polygon) mesh.positions.push(v.x, sampleHeight(field, v.x, v.z), v.z);
          let area = 0;
          for (let j = 0; j < polygon.length; j++)
            area +=
              polygon[j].x * polygon[(j + 1) % polygon.length].z - polygon[(j + 1) % polygon.length].x * polygon[j].z;
          for (let j = 1; j < polygon.length - 1; j++) {
            if (Math.abs(cross(polygon[0], polygon[j], polygon[j + 1])) < 1e-8) continue;
            if (area > 0) mesh.indices.push(offset, offset + j + 1, offset + j);
            else mesh.indices.push(offset, offset + j, offset + j + 1);
          }
        }
      }
  }
  return mesh;
}

function navigationWaterClearance(
  waters: V2WaterSurface[],
  size: number,
  resolution: number,
  reach: number,
  meter: V2Meter
): Float32Array {
  const output = new Float32Array(resolution * resolution).fill(Infinity),
    cell = size / (resolution - 1),
    half = size / 2;
  for (const water of waters) {
    const polygon = water.outline;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        dx = b.x - a.x,
        dz = b.z - a.z,
        length2 = dx * dx + dz * dz;
      const x0 = clamp(Math.floor((Math.min(a.x, b.x) - reach + half) / cell), 0, resolution - 1),
        x1 = clamp(Math.ceil((Math.max(a.x, b.x) + reach + half) / cell), 0, resolution - 1),
        z0 = clamp(Math.floor((Math.min(a.z, b.z) - reach + half) / cell), 0, resolution - 1),
        z1 = clamp(Math.ceil((Math.max(a.z, b.z) + reach + half) / cell), 0, resolution - 1);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          meter.spend();
          const px = x * cell - half,
            pz = z * cell - half,
            t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / Math.max(1e-8, length2), 0, 1),
            id = z * resolution + x;
          output[id] = Math.min(output[id], Math.hypot(px - a.x - t * dx, pz - a.z - t * dz));
        }
    }
    const z0 = clamp(Math.ceil((Math.min(...polygon.map((p) => p.z)) + half) / cell), 0, resolution - 1),
      z1 = clamp(Math.floor((Math.max(...polygon.map((p) => p.z)) + half) / cell), 0, resolution - 1);
    for (let z = z0; z <= z1; z++) {
      const line = z * cell - half,
        crossings: number[] = [];
      for (let i = 0; i < polygon.length; i++) {
        meter.spend();
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length];
        if (a.z > line !== b.z > line) crossings.push(a.x + ((line - a.z) * (b.x - a.x)) / (b.z - a.z));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        for (
          let x = Math.max(0, Math.ceil((crossings[i] + half) / cell));
          x <= Math.min(resolution - 1, Math.floor((crossings[i + 1] + half) / cell));
          x++
        ) {
          meter.spend();
          output[z * resolution + x] = 0;
        }
    }
  }
  return output;
}

function compileRoads(
  recipe: WorldRecipe,
  field: V2Heightfield,
  waters: V2WaterSurface[],
  boxes: V2PlacedBox[],
  meter: V2Meter,
  previous?: WorldSnapshot | null,
  notes: string[] = []
): V2Road[] {
  if (!recipe.routes.length) return [];
  const r = Math.min(129, field.resolution),
    step = field.size / (r - 1),
    half = field.size / 2,
    count = r * r;
  const clearance = new Float32Array(count),
    boxClearance = new Float32Array(count).fill(Infinity),
    slopes = new Float32Array(count),
    waterClearance = navigationWaterClearance(
      waters,
      field.size,
      r,
      Math.max(...recipe.routes.map((route) => route.width / 2)) + recipe.player.radius + step,
      meter
    );
  const position = (id: number): V2Point => ({ x: (id % r) * step - half, z: Math.floor(id / r) * step - half });
  const margin = Math.max(...recipe.routes.map((route) => route.width / 2)) + recipe.player.radius + step * 2;
  for (const box of boxes) {
    if (!box.collision) continue;
    const polygon = boxFootprint(box),
      xs = polygon.map((p) => p.x),
      zs = polygon.map((p) => p.z);
    const x0 = clamp(Math.floor((Math.min(...xs) - margin + half) / step), 0, r - 1),
      x1 = clamp(Math.ceil((Math.max(...xs) + margin + half) / step), 0, r - 1),
      z0 = clamp(Math.floor((Math.min(...zs) - margin + half) / step), 0, r - 1),
      z1 = clamp(Math.ceil((Math.max(...zs) + margin + half) / step), 0, r - 1);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        meter.spend();
        const id = z * r + x;
        boxClearance[id] = Math.min(boxClearance[id], distanceToBox(box, x * step - half, z * step - half));
      }
  }
  for (let id = 0; id < count; id++) {
    const p = position(id);
    meter.spend(4);
    const d = Math.min(half - Math.abs(p.x), half - Math.abs(p.z), waterClearance[id], boxClearance[id]);
    clearance[id] = d;
    slopes[id] = Math.max(
      ...[-0.01, 0.01].flatMap((x) => [-0.01, 0.01].map((z) => sampleSlope(field, p.x + x, p.z + z)))
    );
  }
  const roads: V2Road[] = [],
    offsets = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1]
    ];
  const retainRoad = (request: WorldRecipe["routes"][number], a: V2Point, b: V2Point, reason: string) => {
    const old = previous?.roads.find((road) => road.id === request.id),
      points = old ? [a, ...old.centerline.slice(1, -1), b] : resampleLine([a, b], 3);
    const centerline = resampleLine(points, 3).map((p) => ({ ...p, y: sampleHeight(field, p.x, p.z) })),
      mesh = ribbon(
        centerline,
        centerline.map(() => request.width)
      ).mesh;
    let length = 0,
      maxSlope = 0;
    for (let i = 1; i < centerline.length; i++) {
      const d = distance(centerline[i], centerline[i - 1]);
      length += d;
      maxSlope = Math.max(maxSlope, Math.abs(centerline[i].y - centerline[i - 1].y) / Math.max(1e-6, d));
    }
    roads.push({
      id: request.id,
      kind: request.kind,
      placementDiagnostics: request.placementDiagnostics,
      sourceFeatureIds: request.sourceFeatureIds,
      supportBoxIds: request.supportBoxIds,
      from: request.from,
      to: request.to,
      width: request.width,
      centerline,
      mesh,
      length,
      maxSlope
    });
    notes.push(`${request.label}: ${old ? "沿用原路线" : "使用端点连接"}并贴合新地形（${reason}）；通行效果待检查`);
  };
  for (const request of recipe.routes) {
    if (request.placementDiagnostics?.status === "proposal")
      notes.push(request.placementDiagnostics.message ?? `${request.label}：桥位为可编辑提案，尚未保证物理通行`);
    const a = positionOf(recipe, request.from)!,
      b = positionOf(recipe, request.to)!;
    const radius = request.width / 2 + recipe.player.radius;
    const gridClear = (p: V2Point): boolean => {
      meter.spend(4);
      const x = Math.floor((p.x + half) / step),
        z = Math.floor((p.z + half) / step);
      if (x < 0 || x >= r - 1 || z < 0 || z >= r - 1) return false;
      return (
        Math.min(
          clearance[z * r + x],
          clearance[z * r + x + 1],
          clearance[(z + 1) * r + x],
          clearance[(z + 1) * r + x + 1]
        ) > radius
      );
    };
    const groundRoad = request.kind === "main-road" || request.kind === "branch-road";
    const authoredClear =
      !groundRoad || !request.controls || curveLine([a, ...request.controls, b], step / 2).every(gridClear);
    if (request.controls && authoredClear) {
      const authored = [a, ...request.controls, b],
        supports = boxes.filter((box) => request.supportBoxIds?.includes(box.id));
      const heights = authored.map((p, i) => {
        const exactSupport = boxes.find((box) => box.id === request.pointSupportIds?.[i]);
        if (exactSupport) return exactSupport.baseY + exactSupport.sizeY;
        const endpoint = i === 0 ? request.from : i === authored.length - 1 ? request.to : null;
        const nodeHeight = recipe.routeNodes?.find((node) => node.id === endpoint)?.elevation;
        if (nodeHeight !== undefined) return nodeHeight;
        if (request.pointElevations?.[i] !== undefined) return request.pointElevations[i];
        const offset = request.pointHeights?.[i] ?? 0;
        if (!offset || !supports.length) return sampleHeight(field, p.x, p.z) + offset;
        const support = supports.reduce((best, box) =>
          distance(box.center, p) < distance(best.center, p) ? box : best
        );
        return support.baseY + offset;
      });
      const centerline = curveLine(authored, Math.max(1, field.size / (field.resolution - 1))).map((p) => {
        let closest = Infinity,
          y = sampleHeight(field, p.x, p.z);
        if (request.pointHeights || request.pointSupportIds || request.pointElevations)
          for (let i = 1; i < authored.length; i++) {
            meter.spend();
            const hit = nearestSegment(p, authored[i - 1], authored[i]);
            if (hit.distance < closest) {
              closest = hit.distance;
              y = heights[i - 1] + (heights[i] - heights[i - 1]) * hit.t;
            }
          }
        return { ...p, y };
      });
      // Shared junctions need a level landing before their independently shaped slopes diverge.
      if (request.pointElevations && request.kind !== "crossing") {
        const startHeight = heights[0],
          endHeight = heights[heights.length - 1];
        for (const p of centerline) {
          const startDistance = distance(p, a),
            endDistance = distance(p, b);
          const blend = (d: number) => {
            const t = Math.max(0, Math.min(1, (d - 8) / 12));
            return t * t * (3 - 2 * t);
          };
          if (startDistance < 20) p.y = startHeight + (p.y - startHeight) * blend(startDistance);
          if (endDistance < 20) p.y = endHeight + (p.y - endHeight) * blend(endDistance);
        }
      }
      if (request.pointElevations && request.kind !== "crossing")
        for (const p of centerline) p.y = Math.max(p.y, sampleHeight(field, p.x, p.z) + 0.06);
      let length = 0,
        maxSlope = 0;
      for (let i = 1; i < centerline.length; i++) {
        const d = distance(centerline[i], centerline[i - 1]),
          dy = centerline[i].y - centerline[i - 1].y;
        length += Math.hypot(d, dy);
        maxSlope = Math.max(maxSlope, Math.abs(dy) / Math.max(1e-6, d));
      }
      roads.push({
        id: request.id,
        kind: request.kind,
        placementDiagnostics: request.placementDiagnostics,
        from: request.from,
        to: request.to,
        width: request.width,
        sourceFeatureIds: request.sourceFeatureIds,
        supportBoxIds: request.supportBoxIds,
        centerline,
        mesh: ribbon(
          centerline,
          centerline.map(() => request.width)
        ).mesh,
        length,
        maxSlope
      });
      continue;
    }
    const index = (p: V2Point) => Math.round((p.z + half) / step) * r + Math.round((p.x + half) / step);
    const start = index(a),
      goal = index(b);
    const valid = (id: number) => id >= 0 && id < count && clearance[id] > radius + step * 0.72;
    if (!valid(start) || !valid(goal)) {
      if (recipe.global) {
        retainRoad(request, a, b, "端点邻域变化");
        continue;
      }
      throw new Error(`not-found-within-budget:动线 ${request.label} 的端点没有满足全宽余量的导航网格单元`);
    }
    const cost = new Float64Array(count).fill(Infinity),
      parents = new Int32Array(count).fill(-1),
      closed = new Uint8Array(count),
      heap = new Heap();
    cost[start] = 0;
    heap.push(start, distance(a, b));
    while (heap.values.length) {
      const id = heap.pop();
      if (closed[id]) continue;
      meter.expand();
      closed[id] = 1;
      if (id === goal) break;
      const p = position(id),
        ix = id % r,
        iz = Math.floor(id / r);
      for (const [dx, dz] of offsets) {
        meter.spend();
        const nx = ix + dx,
          nz = iz + dz,
          next = nz * r + nx;
        if (nx <= 0 || nx >= r - 1 || nz <= 0 || nz >= r - 1 || !valid(next) || closed[next]) continue;
        if (dx && dz && (!valid(iz * r + nx) || !valid(nz * r + ix))) continue;
        const q = position(next),
          segmentLength = distance(p, q),
          rise = Math.abs(sampleHeight(field, q.x, q.z) - sampleHeight(field, p.x, p.z)) / segmentLength;

        let bend = 0;
        if (parents[id] >= 0) {
          const previous = position(parents[id]),
            ux = p.x - previous.x,
            uz = p.z - previous.z;
          bend = 1 - (ux * dx + uz * dz) / Math.max(1e-6, Math.hypot(ux, uz) * Math.hypot(dx, dz));
        }
        const trial = cost[id] + segmentLength * (1 + rise * rise * 9) + bend * request.bendPenalty;
        if (trial < cost[next]) {
          cost[next] = trial;
          parents[next] = id;
          heap.push(next, trial + distance(q, b));
        }
      }
    }
    if (!closed[goal]) {
      if (recipe.global) {
        retainRoad(request, a, b, "本轮未找到绕行路线");
        continue;
      }
      throw new Error(`not-found-within-budget:动线 ${request.label} 在保守导航网格中没有找到可行通廊`);
    }
    let ids: number[] = [],
      current = goal;
    while (current >= 0) {
      ids.push(current);
      if (current === start) break;
      current = parents[current];
    }
    ids.reverse();
    const raw = [a, ...ids.slice(1, -1).map(position), b];
    const localClear = gridClear;
    // Visibility pruning shortens the staircase only when the whole corridor remains valid.
    const pruned: V2Point[] = [raw[0]];
    for (let i = 0; i < raw.length - 1; ) {
      let next = Math.min(raw.length - 1, i + 10);
      while (next > i + 1 && !resampleLine([raw[i], raw[next]], step / 3).every(localClear)) next--;
      pruned.push(raw[next]);
      i = next;
    }
    const smooth = curveLine(pruned, step / 3),
      points = smooth.every(localClear) ? smooth : resampleLine(pruned, step / 3);
    const centerline = recipe.global
      ? points.map((p) => ({ ...p, y: sampleHeight(field, p.x, p.z) }))
      : gradeRoad(recipe, request, points, field, meter);
    const shape = ribbon(
      centerline,
      points.map(() => request.width)
    );
    for (let i = 0; i < shape.mesh.positions.length; i += 3)
      shape.mesh.positions[i + 1] = sampleHeight(field, shape.mesh.positions[i], shape.mesh.positions[i + 2]);
    let length = 0,
      maxSlope = 0;
    for (let i = 1; i < centerline.length; i++) {
      const d = distance(centerline[i], centerline[i - 1]);
      length += Math.hypot(d, centerline[i].y - centerline[i - 1].y);
      maxSlope = Math.max(maxSlope, Math.abs(centerline[i].y - centerline[i - 1].y) / Math.max(1e-6, d));
    }
    roads.push({
      id: request.id,
      kind: request.kind,
      placementDiagnostics: request.placementDiagnostics,
      sourceFeatureIds: request.sourceFeatureIds,
      supportBoxIds: request.supportBoxIds,
      from: request.from,
      to: request.to,
      width: request.width,
      centerline,
      mesh: shape.mesh,
      length,
      maxSlope
    });
  }
  for (const road of roads) {
    const request = recipe.routes.find((request) => request.id === road.id);
    if (request?.pointHeights || request?.pointSupportIds || request?.pointElevations) continue;
    road.centerline = road.centerline.map((p) => ({ ...p, y: sampleHeight(field, p.x, p.z) }));
    const raw = ribbon(
      road.centerline,
      road.centerline.map(() => road.width)
    ).mesh;
    road.mesh = drapeRoad(raw, field, meter);
  }
  return roads;
}
function repairHardSightBoxes(recipe: WorldRecipe, snapshot: WorldSnapshot, meter: V2Meter, adjusted: string[]): void {
  for (const relation of recipe.views.filter((v) => v.hard && v.mode === "visible")) {
    let sight = snapshot.sights.find((s) => s.id === relation.id)!;
    if (sight.visibleFraction >= relation.minimum && sight.visibleFraction <= relation.maximum) continue;
    const blockers = Array.from(
      new Set(sight.samples.map((s) => s.blocker).filter((id): id is string => !!id && id !== "terrain"))
    );
    for (const blocker of blockers) {
      const box = snapshot.boxes.find((b) => b.id === blocker);
      if (!box || box.locked) continue;
      const original = { ...box, center: { ...box.center } },
        radius = Math.hypot(box.sizeX, box.sizeZ) / 2;
      const ray = sight.samples.find((s) => s.blocker === blocker)!;
      const length = distance(ray.from, ray.to),
        nx = -(ray.to.z - ray.from.z) / Math.max(1e-6, length),
        nz = (ray.to.x - ray.from.x) / Math.max(1e-6, length);
      const projection = nearestSegment(original.center, ray.from, ray.to).point;
      const candidates = [-1, 1]
        .map((side) => ({ x: projection.x + nx * (radius + 4) * side, z: projection.z + nz * (radius + 4) * side }))
        .sort((a, b) => distance(a, original.center) - distance(b, original.center));
      for (const center of candidates) {
        meter.spend(snapshot.roads.reduce((n, r) => n + r.centerline.length * 16, 0));
        if (
          Math.max(Math.abs(center.x), Math.abs(center.z)) + radius >= recipe.size / 2 ||
          distanceToWater(snapshot.waters, center) <= radius
        )
          continue;
        const trial = { ...original, center };
        const footprint = boxFootprint(trial);
        if (
          snapshot.pois.some((p) => distanceToBox(trial, p.position.x, p.position.z) < p.radius + recipe.player.radius)
        )
          continue;
        if (
          trial.collision &&
          snapshot.roads.some((road) =>
            road.centerline.some(
              (p, i) =>
                i > 0 &&
                segmentPolygonDistance(road.centerline[i - 1], p, footprint) < road.width / 2 + recipe.player.radius
            )
          )
        )
          continue;
        const baseY = terrainRange(snapshot.heightfield, footprint, (count) => meter.spend(count)).min;
        box.center = center;
        box.baseY = baseY - 0.05;
        box.y = box.baseY + box.sizeY / 2;
        const candidate = buildTargetSight(snapshot, ray.from, relation.target, meter);
        if (candidate.visibleFraction > sight.visibleFraction && candidate.visibleFraction <= relation.maximum) {
          adjusted.push(
            `${box.id}: 为硬视线 ${relation.id} 让出通道，平移 ${distance(center, original.center).toFixed(1)} 米`
          );
          snapshot.sights = buildSights(recipe, snapshot, meter);
          sight = snapshot.sights.find((s) => s.id === relation.id)!;
          break;
        }
        Object.assign(box, original);
      }
      if (sight.visibleFraction >= relation.minimum) break;
    }
  }
}

function integratedSmooth5(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return t - 0.5;
  return t ** 4 * (t * t - 3 * t + 2.5);
}

function filteredRoadCoverage(distance: number, width: number, footprint: number): number {
  // Integrating both strip edges retains sub-texel roads; a single distance threshold can erase them.
  const feather = 1.5,
    integral = (x: number) => feather * integratedSmooth5((x + feather / 2) / feather),
    lo = distance - footprint / 2,
    hi = distance + footprint / 2,
    radius = width / 2;
  return clamp(
    (integral(hi + radius) - integral(lo + radius) - integral(hi - radius) + integral(lo - radius)) / footprint,
    0,
    1
  );
}

function buildAlphamap(
  recipe: WorldRecipe,
  snapshot: WorldSnapshot,
  wetness: Float32Array,
  meter: V2Meter
): NonNullable<WorldSnapshot["alphamap"]> {
  const resolution = recipe.alphamapResolution ?? recipe.resolution - 1,
    weights = new Uint8Array(resolution * resolution * 4),
    road = new Float32Array(resolution * resolution),
    soil = new Float32Array(resolution * resolution),
    cell = recipe.size / resolution,
    half = recipe.size / 2;
  const hr = snapshot.heightfield.resolution;
  for (let z = 0; z < resolution; z++)
    for (let x = 0; x < resolution; x++) {
      meter.spend();
      const hx = ((x + 0.5) / resolution) * (hr - 1),
        hz = ((z + 0.5) / resolution) * (hr - 1),
        ix = Math.floor(hx),
        iz = Math.floor(hz),
        tx = hx - ix,
        tz = hz - iz,
        ix1 = Math.min(hr - 1, ix + 1),
        iz1 = Math.min(hr - 1, iz + 1);
      soil[z * resolution + x] =
        (wetness[iz * hr + ix] * (1 - tx) + wetness[iz * hr + ix1] * tx) * (1 - tz) +
        (wetness[iz1 * hr + ix] * (1 - tx) + wetness[iz1 * hr + ix1] * tx) * tz;
    }
  // Rasterize the authoritative water triangles, including junction caps and irregular lake outlines.
  for (const water of snapshot.waters) {
    const { positions, indices } = water.mesh;
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const ai = indices[triangle] * 3,
        bi = indices[triangle + 1] * 3,
        ci = indices[triangle + 2] * 3,
        a = { x: positions[ai], z: positions[ai + 2] },
        b = { x: positions[bi], z: positions[bi + 2] },
        c = { x: positions[ci], z: positions[ci + 2] },
        determinant = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
      meter.spend();
      if (Math.abs(determinant) < 1e-10) continue;
      const x0 = clamp(Math.ceil((Math.min(a.x, b.x, c.x) + half) / cell - 0.5), 0, resolution - 1),
        x1 = clamp(Math.floor((Math.max(a.x, b.x, c.x) + half) / cell - 0.5), 0, resolution - 1),
        z0 = clamp(Math.ceil((Math.min(a.z, b.z, c.z) + half) / cell - 0.5), 0, resolution - 1),
        z1 = clamp(Math.floor((Math.max(a.z, b.z, c.z) + half) / cell - 0.5), 0, resolution - 1);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          meter.spend();
          const dx = (x + 0.5) * cell - half - a.x,
            dz = (z + 0.5) * cell - half - a.z,
            u = (dx * (c.z - a.z) - dz * (c.x - a.x)) / determinant,
            v = ((b.x - a.x) * dz - (b.z - a.z) * dx) / determinant;
          if (u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8) soil[z * resolution + x] = 1;
        }
    }
  }
  for (const route of snapshot.roads.filter((route) => route.kind !== "crossing" && !route.supportBoxIds?.length))
    for (let i = 1; i < route.centerline.length; i++) {
      const a = route.centerline[i - 1],
        b = route.centerline[i],
        radius = route.width / 2 + cell + 1.5,
        dx = b.x - a.x,
        dz = b.z - a.z,
        length2 = dx * dx + dz * dz;
      const x0 = clamp(Math.floor((Math.min(a.x, b.x) - radius + half) / cell), 0, resolution - 1),
        x1 = clamp(Math.floor((Math.max(a.x, b.x) + radius + half) / cell), 0, resolution - 1),
        z0 = clamp(Math.floor((Math.min(a.z, b.z) - radius + half) / cell), 0, resolution - 1),
        z1 = clamp(Math.floor((Math.max(a.z, b.z) + radius + half) / cell), 0, resolution - 1);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          meter.spend();
          const px = (x + 0.5) * cell - half,
            pz = (z + 0.5) * cell - half,
            t = clamp(((px - a.x) * dx + (pz - a.z) * dz) / Math.max(1e-8, length2), 0, 1),
            ox = px - a.x - t * dx,
            oz = pz - a.z - t * dz,
            d = Math.hypot(ox, oz),
            footprint =
              cell *
              (d > 1e-8
                ? (Math.abs(ox) + Math.abs(oz)) / d
                : length2 > 1e-8
                  ? (Math.abs(dx) + Math.abs(dz)) / Math.sqrt(length2)
                  : 1),
            id = z * resolution + x;
          road[id] = Math.max(road[id], filteredRoadCoverage(d, route.width, footprint));
        }
    }
  for (let z = 0; z < resolution; z++)
    for (let x = 0; x < resolution; x++) {
      meter.spend();
      const index = z * resolution + x,
        soilWeight = clamp(soil[index], 0, 1),
        roadWeight = road[index] * (1 - soilWeight),
        offset = index * 4;
      weights[offset] = Math.round(soilWeight * 255);
      weights[offset + 2] = Math.min(255 - weights[offset], Math.round(roadWeight * 255));
      weights[offset + 1] = 255 - weights[offset] - weights[offset + 2];
      // Inland terrain has no ocean shoreline; the exterior coast renderer owns its sand coverage.
      weights[offset + 3] = 0;
    }
  return { resolution, channels: V2_SURFACE_CHANNELS, weights };
}

function buildCrossingDecks(
  field: V2Heightfield,
  waters: V2WaterSurface[],
  roads: V2Road[],
  boxes: V2PlacedBox[]
): void {
  for (const road of roads) {
    if (road.kind !== "crossing" || road.centerline.length < 2) continue;
    const a = road.centerline[0],
      b = road.centerline[road.centerline.length - 1];
    let level = Math.max(a.y, b.y, sampleHeight(field, a.x, a.z), sampleHeight(field, b.x, b.z));
    const length = Math.max(1e-6, distance(a, b)),
      nx = -(b.z - a.z) / length,
      nz = (b.x - a.x) / length;
    for (const p of road.centerline) {
      for (const lateral of [-(road.width + 1) / 2, 0, (road.width + 1) / 2])
        level = Math.max(level, sampleHeight(field, p.x + nx * lateral, p.z + nz * lateral));
      const waterLevel = sampleMeshUnion(waters, p.x, p.z);
      if (waterLevel !== null) level = Math.max(level, waterLevel + 0.35);
    }
    level += 0.06;
    const id = `bridge:${road.id}:deck`;
    boxes.push({
      id,
      label: "跨越桥面占位",
      appearance: "bridge",
      center: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
      sizeX: distance(a, b) + 1,
      sizeY: 0.8,
      sizeZ: road.width + 1,
      yaw: Math.atan2(b.z - a.z, b.x - a.x),
      collision: true,
      occlusion: true,
      baseY: level - 0.8,
      y: level - 0.4
    });
    road.centerline = road.centerline.map((p) => ({ ...p, y: level }));
    road.mesh = ribbon(
      road.centerline,
      road.centerline.map(() => road.width)
    ).mesh;
    road.supportBoxIds = [id];
    road.maxSlope = 0;
  }
  // Bridge clearances change the landing height. Reconcile every connected approach before building solids.
  const landings = new Map<string, number>();
  for (const road of roads)
    if (road.kind === "crossing") {
      landings.set(road.from, road.centerline[0].y);
      landings.set(road.to, road.centerline[road.centerline.length - 1].y);
    }
  for (const road of roads)
    if (road.kind !== "crossing") {
      const start = { ...road.centerline[0] },
        end = { ...road.centerline[road.centerline.length - 1] };
      for (const [id, endpoint] of [
        [road.from, start],
        [road.to, end]
      ] as const) {
        const y = landings.get(id);
        if (y === undefined) continue;
        for (const p of road.centerline) {
          const d = distance(p, endpoint),
            t = Math.max(0, Math.min(1, (d - 5) / 10));
          if (d < 15) p.y = y + (p.y - y) * t * t * (3 - 2 * t);
        }
      }
      road.mesh = ribbon(
        road.centerline,
        road.centerline.map(() => road.width)
      ).mesh;
      road.length = 0;
      road.maxSlope = 0;
      for (let i = 1; i < road.centerline.length; i++) {
        const a = road.centerline[i - 1],
          b = road.centerline[i],
          d = distance(a, b),
          dy = Math.abs(b.y - a.y);
        road.length += Math.hypot(d, dy);
        road.maxSlope = Math.max(road.maxSlope, dy / Math.max(1e-6, d));
      }
    }
}

/** Fill explicitly requested ascending paths with solid whitebox steps, using the published route heights. */
function buildRouteSteps(
  recipe: WorldRecipe,
  field: V2Heightfield,
  roads: V2Road[],
  boxes: V2PlacedBox[],
  meter: V2Meter
): void {
  for (const road of roads) {
    const request = recipe.routes.find((request) => request.id === road.id);
    if (
      road.kind === "crossing" ||
      !(
        request?.solidSupport ||
        (request?.pointElevations && road.centerline.some((p) => p.y > sampleHeight(field, p.x, p.z) + 0.1))
      )
    )
      continue;
    const supports = [...(road.supportBoxIds ?? [])];
    for (let i = 1; i < road.centerline.length; i++) {
      const a = road.centerline[i - 1],
        b = road.centerline[i],
        length = distance(a, b);
      const count = Math.max(1, Math.ceil(Math.max(length / 0.4, Math.abs(b.y - a.y) / 0.16)));
      for (let j = 0; j < count; j++) {
        meter.spend();
        const t = (j + 0.5) / count,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t;
        const top = a.y + (b.y - a.y) * t - 0.025;
        const baseY = sampleHeight(field, x, z) - 0.2;
        if (top <= baseY + 0.05) continue;
        const id = `steps:${road.id}:${i}:${j}`;
        boxes.push({
          id,
          label: "登高支撑台阶",
          appearance: "platform",
          center: { x, z },
          sizeX: (length / count) * 1.01,
          sizeZ: road.width + 0.4,
          sizeY: top - baseY,
          yaw: Math.atan2(b.z - a.z, b.x - a.x),
          baseY,
          y: (top + baseY) / 2,
          collision: true,
          occlusion: true
        });
        supports.push(id);
      }
    }
    road.supportBoxIds = supports;
  }
}

function compileFocusBounds(recipe: WorldRecipe, snapshot: WorldSnapshot, source: WorldRecipe): void {
  type Bounds = V2Bounds & { minY: number; maxY: number };
  const bounds: Record<string, Bounds> = {},
    parents: Record<string, string> = {};
  const put = (id: string, points: V2Point3[], padding = 0) => {
    if (!points.length) return;
    const b: Bounds = {
      minX: Infinity,
      minY: Infinity,
      minZ: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      maxZ: -Infinity
    };
    for (const p of points) {
      b.minX = Math.min(b.minX, p.x - padding);
      b.maxX = Math.max(b.maxX, p.x + padding);
      b.minZ = Math.min(b.minZ, p.z - padding);
      b.maxZ = Math.max(b.maxZ, p.z + padding);
      b.minY = Math.min(b.minY, p.y);
      b.maxY = Math.max(b.maxY, p.y);
    }
    bounds[id] = b;
  };
  put("spawn", [snapshot.spawn], recipe.player.radius);
  for (const box of snapshot.boxes)
    put(
      box.id,
      boxFootprint(box).flatMap((p) => [
        { ...p, y: box.baseY },
        { ...p, y: box.baseY + box.sizeY }
      ])
    );
  for (const water of snapshot.waters) {
    const points: V2Point3[] = [];
    for (let i = 0; i < water.mesh.positions.length; i += 3)
      points.push({ x: water.mesh.positions[i], y: water.mesh.positions[i + 1], z: water.mesh.positions[i + 2] });
    put(water.id, points);
  }
  for (const road of snapshot.roads) {
    put(road.id, road.centerline, road.width / 2);
    for (const id of road.supportBoxIds ?? []) if (!recipe.boxes.some((box) => box.id === id)) parents[id] = road.id;
  }
  for (const box of snapshot.boxes) {
    const road = snapshot.roads.find((road) => box.id.startsWith(`ridge:${road.id}:`));
    if (road) parents[box.id] = road.id;
  }
  for (const poi of snapshot.pois) {
    put(
      poi.id,
      [
        ...(poi.outline ?? []).map((p) => ({ ...p, y: poi.y })),
        { ...poi.position, y: poi.y },
        { ...(poi.markerPosition ?? poi.position), y: (poi.markerBaseY ?? poi.y) + poi.markerHeight }
      ],
      poi.outline ? 0 : poi.radius
    );
    for (const area of poi.activityAreas ?? [])
      put(
        area.id,
        area.outline.map((p) => ({ ...p, y: poi.y }))
      );
    for (const slot of poi.slots ?? []) {
      const box = snapshot.boxes.find((b) => b.id === slot.boxId);
      if (box && bounds[box.id]) bounds[slot.id] = bounds[box.id];
      else
        put(
          slot.id,
          [
            { ...slot.center, y: poi.y },
            { ...slot.center, y: poi.y + slot.sizeY }
          ],
          Math.max(slot.sizeX, slot.sizeZ) / 2
        );
    }
    for (const entry of poi.entrances ?? [])
      put(
        entry.id,
        [{ ...entry.position, y: sampleHeight(snapshot.heightfield, entry.position.x, entry.position.z) }],
        2
      );
  }
  for (const node of snapshot.routeNodes ?? []) put(node.id, [{ ...node.position, y: node.y }], node.radius ?? 2);
  for (const node of recipe.riverNodes) put(node.id, [{ ...node, y: node.level }]);
  for (const canyon of recipe.canyons)
    put(
      canyon.id,
      canyon.points.map((p) => ({ ...p, y: sampleHeight(snapshot.heightfield, p.x, p.z) })),
      canyon.width / 2
    );
  for (const elevation of recipe.elevations)
    put(elevation.id, [
      { x: elevation.center.x - elevation.radiusX, z: elevation.center.z - elevation.radiusZ, y: recipe.baseHeight },
      {
        x: elevation.center.x + elevation.radiusX,
        z: elevation.center.z + elevation.radiusZ,
        y: recipe.baseHeight + elevation.height
      }
    ]);
  for (const group of source.groups ?? []) {
    const points: V2Point3[] = [];
    for (const id of group.memberIds) {
      parents[id] = group.id;
      const b = bounds[id];
      if (b) points.push({ x: b.minX, y: b.minY, z: b.minZ }, { x: b.maxX, y: b.maxY, z: b.maxZ });
    }
    put(group.id, points);
  }
  for (const view of snapshot.sights)
    put(
      view.id,
      view.samples.flatMap((sample) => [sample.from, sample.to])
    );
  snapshot.focusBounds = bounds;
  snapshot.featureParents = parents;
}

function impact(source: WorldRecipe, snapshot: WorldSnapshot, previous?: WorldSnapshot): ValidationReport["impact"] {
  let bounds: V2Bounds | null = null,
    changed = 0;
  const grid = snapshot.heightfield,
    step = grid.size / (grid.resolution - 1);
  for (let i = 0; i < grid.heights.length; i++)
    if (
      !previous ||
      previous.heightfield.size !== grid.size ||
      previous.heightfield.resolution !== grid.resolution ||
      previous.heightfield.heights[i] !== grid.heights[i]
    ) {
      changed++;
      const x = (i % grid.resolution) * step - grid.size / 2,
        z = Math.floor(i / grid.resolution) * step - grid.size / 2;
      bounds = bounds
        ? {
            minX: Math.min(bounds.minX, x),
            minZ: Math.min(bounds.minZ, z),
            maxX: Math.max(bounds.maxX, x),
            maxZ: Math.max(bounds.maxZ, z)
          }
        : { minX: x, minZ: z, maxX: x, maxZ: z };
    }
  const changedIds = Object.keys(snapshot.sourceSignatures || {}).filter(
    (id) => snapshot.sourceSignatures?.[id] !== previous?.sourceSignatures?.[id]
  );
  for (const id of Object.keys(previous?.sourceSignatures || {}))
    if (!(id in (snapshot.sourceSignatures || {}))) changedIds.push(id);
  const affectedIds: string[] = [];
  const compare = (objects: { id: string }[], previousObjects: { id: string }[] | undefined) => {
    for (const o of objects)
      if (!previousObjects || JSON.stringify(o) !== JSON.stringify(previousObjects.find((p) => p.id === o.id)))
        affectedIds.push(o.id);
  };
  compare(snapshot.waters, previous?.waters);
  compare(snapshot.roads, previous?.roads);
  compare(snapshot.boxes, previous?.boxes);
  compare(snapshot.pois, previous?.pois);
  compare(snapshot.sights, previous?.sights);
  for (const box of [...snapshot.boxes, ...(previous?.boxes || [])])
    if (affectedIds.includes(box.id)) {
      const d = Math.hypot(box.sizeX, box.sizeZ) / 2,
        b = { minX: box.center.x - d, minZ: box.center.z - d, maxX: box.center.x + d, maxZ: box.center.z + d };
      bounds = bounds
        ? {
            minX: Math.min(bounds.minX, b.minX),
            minZ: Math.min(bounds.minZ, b.minZ),
            maxX: Math.max(bounds.maxX, b.maxX),
            maxZ: Math.max(bounds.maxZ, b.maxZ)
          }
        : b;
    }
  return { changedIds, affectedIds, bounds, changedHeightSamples: changed, totalHeightSamples: grid.heights.length };
}
/** Compile one explicit transaction, with no random reroll or implicit follow-up job. @param source Authoring intent. @param previous Last valid snapshot retained if the request fails. @param budget Shared limits. @returns Published or retained snapshot and an honest independent report. */
export function compileRecipe(
  source: WorldRecipe,
  previous?: WorldSnapshot | null,
  budget: V2Budget = DEFAULT_V2_BUDGET
): V2CompileResult {
  const meter = new V2Meter(budget),
    emptyImpact = { changedIds: [], affectedIds: [], bounds: null, changedHeightSamples: 0, totalHeightSamples: 0 };
  let candidate: WorldSnapshot | null = null;
  const report: ValidationReport = {
    status: "valid",
    published: false,
    intentSatisfied: false,
    checks: [],
    messages: [],
    operations: 0,
    searchExpansions: 0,
    durationMs: 0,
    candidateCount: 0,
    impact: emptyImpact,
    adjusted: []
  };
  try {
    const problem = requireInput(source, meter);
    if (problem) throw new Error(problem);
    const recipe = resolveRecipe(source),
      resolvedProblem = requireInput(recipe, meter);
    if (resolvedProblem) throw new Error(resolvedProblem);
    report.candidateCount = 1;
    const r = recipe.resolution,
      field: V2Heightfield = {
        resolution: r,
        size: recipe.size,
        heights: new Float32Array(r * r),
        min: Infinity,
        max: -Infinity
      };

    for (let iz = 0; iz < r; iz++)
      for (let ix = 0; ix < r; ix++) {
        meter.spend(4);
        const x = (ix / (r - 1) - 0.5) * recipe.size,
          z = (iz / (r - 1) - 0.5) * recipe.size;
        field.heights[iz * r + ix] = terrainBase(recipe, x, z, meter);
      }
    // Ordinary ownership/transform groups do not request regional terrain relief.
    if (recipe.global) {
      applyMountainFoundations(recipe, source.groups, field, meter);
      const originHeight = sampleHeight(field, recipe.spawn.x, recipe.spawn.z) - (recipe.spawn.elevation ?? 0);
      for (let i = 0; i < field.heights.length; i++) field.heights[i] -= originHeight;
    }
    const waters = waterGeometry(recipe, field, meter);
    const wetness = carveWater(field, waters, meter);
    reserveStoppingAreas(recipe, field, waters, meter);
    if (!recipe.global) reserveBoxes(recipe, waters, meter, report.adjusted);
    meter.checkpoint();
    for (const h of field.heights) {
      field.min = Math.min(field.min, h);
      field.max = Math.max(field.max, h);
    }
    const terrainBeforeRoads = field.heights.slice();
    let boxes = groundBoxes(recipe, field, meter);
    const roads = compileRoads(recipe, field, waters, boxes, meter, previous, report.adjusted);
    boxes = groundBoxes(recipe, field, meter);
    buildCrossingDecks(field, waters, roads, boxes);
    buildRouteLandforms(recipe, field, roads, boxes, meter);
    buildRouteSteps(recipe, field, roads, boxes, meter);
    field.min = Infinity;
    field.max = -Infinity;
    for (const h of field.heights) {
      meter.spend();
      field.min = Math.min(field.min, h);
      field.max = Math.max(field.max, h);
    }
    const identity = hashText(JSON.stringify(source));
    candidate = {
      version: 2,
      algorithm: "layout-2.0",
      id: `world:${identity}`,
      recipeHash: identity,
      seed: recipe.seed,
      size: recipe.size,
      heightfield: field,
      global: recipe.global ? clone(recipe.global) : undefined,
      waters,
      roads,
      boxes,
      routeNodes: recipe.routeNodes?.map((node) => {
        const support = boxes.find((box) => box.id === node.supportBoxId);
        const bridge = roads.find((road) => road.kind === "crossing" && (road.from === node.id || road.to === node.id));
        const approachHeights = roads.flatMap((road) =>
          road.from === node.id
            ? [road.centerline[0].y]
            : road.to === node.id
              ? [road.centerline[road.centerline.length - 1].y]
              : []
        );
        return {
          ...node,
          y: support
            ? support.baseY + support.sizeY
            : (bridge?.centerline[0].y ??
              Math.max(
                node.elevation ?? -Infinity,
                sampleHeight(field, node.position.x, node.position.z),
                ...approachHeights
              ))
        };
      }),
      pois: recipe.pois.map((p) => {
        const markerPosition = { x: p.position.x + p.radius * 0.75, z: p.position.z };
        const support = boxes.find((box) => box.id === p.supportBoxId),
          standingY = support
            ? support.baseY + support.sizeY
            : Math.max(p.elevation ?? -Infinity, sampleHeight(field, p.position.x, p.position.z));
        return {
          ...p,
          y: standingY,
          markerWidth: p.markerWidth ?? 2,
          markerPosition,
          markerBaseY:
            support || p.elevation !== undefined ? standingY : sampleHeight(field, markerPosition.x, markerPosition.z)
        };
      }),
      sights: [],
      spawn: { ...recipe.spawn, y: sampleHeight(field, recipe.spawn.x, recipe.spawn.z) },
      player: clone(recipe.player),
      report
    };
    candidate.sights = buildSights(recipe, candidate, meter);
    compileFocusBounds(recipe, candidate, source);
    if (!recipe.global) repairHardSightBoxes(recipe, candidate, meter, report.adjusted);
    candidate.alphamap = buildAlphamap(recipe, candidate, wetness, meter);

    candidate.terrainBeforeRoads = terrainBeforeRoads;
    candidate.sourceSignatures = Object.fromEntries(
      [
        ...source.elevations,
        ...source.rivers,
        ...source.riverNodes,
        ...source.lakes,
        ...source.canyons,
        ...source.boxes,
        ...source.pois,
        ...(source.routeNodes ?? []),
        ...source.routes,
        ...source.views,
        ...(source.groups || [])
      ].map((object) => [object.id, hashText(JSON.stringify(object))])
    );
    candidate.sourceSignatures["$terrain"] = hashText(
      JSON.stringify([
        source.seed,
        source.size,
        source.resolution,
        source.baseHeight,
        source.roughness,
        source.noiseScale,
        source.global
      ])
    );
    candidate.sourceSignatures["$riverScale"] = String(source.riverScale);
    candidate.sourceSignatures["$spawn"] = hashText(JSON.stringify(source.spawn));
    candidate.sampling = {
      terrainCell: recipe.size / (recipe.resolution - 1),
      routeStep: recipe.size / (recipe.resolution - 1) / 3,
      footprintSamples: 9,
      sightSamples: 9
    };
    report.impact = impact(source, candidate, previous || undefined);
    const checks = validateDataSafety(recipe, candidate, meter);
    report.checks = checks;
    if (checks.some((check) => check.hard && !check.passed)) {
      report.status = "not-found-within-budget";
      report.messages.push("数据包含非有限值或无效网格索引；保留已发布布局");
    } else {
      report.published = true;
      const softFailed = checks.filter((check) => !check.hard && !check.passed).length;
      report.intentSatisfied = softFailed === 0 && report.adjusted.length === 0;
      report.messages.push(
        softFailed
          ? `硬约束通过；${softFailed} 项软关系未满足，请查看逐项诊断`
          : "布局已更新；有限数据与网格索引检查通过"
      );
      if (report.adjusted.length)
        report.messages.push(`保留 ${report.adjusted.length} 项调整说明；其中的动线提案不代表物理通行已验证`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error),
      separator = message.indexOf(":"),
      status = separator > 0 ? message.slice(0, separator) : "";
    report.status =
      error instanceof V2BudgetExceeded
        ? "not-found-within-budget"
        : ["invalid-input", "proved-conflict", "unsupported", "not-found-within-budget"].includes(status)
          ? (status as ValidationReport["status"])
          : "invalid-input";
    report.messages.push(separator > 0 && status === report.status ? message.slice(separator + 1) : message);
  }
  report.operations = meter.operations;
  report.searchExpansions = meter.searchExpansions;
  report.durationMs = performance.now() - meter.start;
  return { snapshot: report.published ? candidate : previous || null, candidate, report };
}

/** Measure the largest authored reach deviation from its endpoint chord. @param recipe Editable river graph. @returns Meander amplitude in metres. */
export function getRiverMeander(recipe: WorldRecipe): number {
  let amplitude = 0;
  for (const river of recipe.rivers) {
    const a = recipe.riverNodes.find((n) => n.id === river.from),
      b = recipe.riverNodes.find((n) => n.id === river.to);
    if (!a || !b) continue;
    for (const p of river.controls) amplitude = Math.max(amplitude, nearestSegment(p, a, b).distance);
  }
  return amplitude;
}
/** Scale reach curvature while retaining graph junctions and existing signed control deviations. @param recipe Mutable authoring intent. @param amplitude Requested largest lateral deviation in metres. */
export function setRiverMeander(recipe: WorldRecipe, amplitude: number): void {
  const old = getRiverMeander(recipe);
  for (const river of recipe.rivers) {
    const a = recipe.riverNodes.find((n) => n.id === river.from),
      b = recipe.riverNodes.find((n) => n.id === river.to);
    if (!a || !b) continue;
    const length = Math.max(1e-6, distance(a, b));
    river.controls = river.controls.map((p, i) => {
      const q = nearestSegment(p, a, b).point;
      const coefficient = old > 1e-6 ? amplitude / old : 0;
      return old > 1e-6
        ? { x: q.x + (p.x - q.x) * coefficient, z: q.z + (p.z - q.z) * coefficient }
        : {
            x: q.x - ((b.z - a.z) / length) * amplitude * (i % 2 ? -1 : 1),
            z: q.z + ((b.x - a.x) / length) * amplitude * (i % 2 ? -1 : 1)
          };
    });
  }
}
/** Change destination count with stable surviving objects and explicit connected route requests. @param recipe Mutable authoring intent. @param count Requested number of destinations. */
export function setDestinationCount(recipe: WorldRecipe, count: number): void {
  if (!Number.isInteger(count) || count < 0 || count > 64) throw new Error("目的地数量必须为 0–64 的整数");
  const n = count;
  recipe.pois = recipe.pois.slice(0, n);
  for (let i = recipe.pois.length; i < n; i++) {
    const id = `poi-extra-${i}`,
      x = (-0.24 - namedRandom(recipe.seed, `${id}.x`) * 0.19) * recipe.size,
      z = (namedRandom(recipe.seed, `${id}.z`) - 0.5) * recipe.size * 0.7;
    recipe.pois.push({
      id,
      label: `停留点 ${i + 1}`,
      position: { x, z },
      radius: recipe.size * 0.012,
      markerHeight: 10
    });
  }
  const ids = new Set(["spawn", ...recipe.pois.map((p) => p.id)]);
  recipe.routes = recipe.routes.filter((r) => ids.has(r.from) && ids.has(r.to));
  recipe.views = recipe.views.filter(
    (v) => ids.has(v.from) && (ids.has(v.target) || recipe.boxes.some((b) => b.id === v.target))
  );
  const connected = new Set<string>(["spawn"]);
  for (let i = 0; i < recipe.pois.length; i++)
    for (const r of recipe.routes) {
      if (connected.has(r.from)) connected.add(r.to);
      if (connected.has(r.to)) connected.add(r.from);
    }
  for (const p of recipe.pois)
    if (!connected.has(p.id)) {
      const from = Array.from(connected)
        .map((id) => ({ id, p: positionOf(recipe, id)! }))
        .sort((a, b) => distance(a.p, p.position) - distance(b.p, p.position))[0].id;
      recipe.routes.push({
        id: `route-to-${p.id}`,
        label: `通往 ${p.label}`,
        from,
        to: p.id,
        width: 6,
        maxSlope: Math.min(0.55, recipe.player.maxSlope),
        bendPenalty: 1.8
      });
      connected.add(p.id);
    }
}
/** Change the number of graph edges; infeasible connectivity is left for the independent checker. @param recipe Mutable authoring intent. @param count Requested route count. */
export function setRouteCount(recipe: WorldRecipe, count: number): void {
  const maximum = ((recipe.pois.length + 1) * recipe.pois.length) / 2;
  if (!Number.isInteger(count) || count < 0 || count > 128 || count > maximum)
    throw new Error(`当前点图最多支持 ${Math.min(128, maximum)} 条不同连接`);
  const n = count;
  recipe.routes = recipe.routes.slice(0, n);
  const ids = ["spawn", ...recipe.pois.map((p) => p.id)];
  for (let i = 0; i < ids.length && recipe.routes.length < n; i++)
    for (let j = i + 1; j < ids.length && recipe.routes.length < n; j++) {
      const from = ids[i],
        to = ids[j];
      if (!recipe.routes.some((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from)))
        recipe.routes.push({
          id: `route:${from}:${to}`,
          label: `连接 ${from} → ${to}`,
          from,
          to,
          width: 6,
          maxSlope: Math.min(0.55, recipe.player.maxSlope),
          bendPenalty: 1.8
        });
    }
}
