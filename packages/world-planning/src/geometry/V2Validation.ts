import type {
  WorldRecipe,
  WorldSnapshot,
  V2Budget,
  ValidationReport,
  V2Check,
  V2Point3,
  V2Sight,
  V2SightSample,
  V2PlacedBox
} from "../spatial/V2Model.ts";
import {
  sampleHeight,
  sampleSlope,
  sampleWater,
  sampleMesh,
  distance,
  distanceToWater,
  distanceToBox,
  segmentBoxHit,
  isSimplePolygon,
  measureCorridor,
  terrainRange,
  boxFootprint
} from "./V2Geometry";
import { resolveRecipe } from "./V2Compiler";
import { V2Meter, V2BudgetExceeded, DEFAULT_V2_BUDGET } from "./V2Budget";

function terrainHit(snapshot: WorldSnapshot, a: V2Point3, b: V2Point3, meter: V2Meter): number | null {
  const field = snapshot.heightfield,
    step = field.size / (field.resolution - 1),
    half = field.size / 2,
    times = [0, 1];
  // A heightfield triangle and the sight ray are affine between grid and diagonal crossings.
  for (const [origin, end, offset] of [
    [a.x, b.x, half],
    [a.z, b.z, half],
    [a.x + a.z, b.x + b.z, field.size]
  ]) {
    if (Math.abs(end - origin) < 1e-9) continue;
    const lo = Math.ceil((Math.min(origin, end) + offset) / step),
      hi = Math.floor((Math.max(origin, end) + offset) / step);
    for (let k = lo; k <= hi; k++) {
      meter.spend();
      const t = (k * step - offset - origin) / (end - origin);
      if (t > 0 && t < 1) times.push(t);
    }
  }
  times.sort((x, y) => x - y);
  let priorT = 0,
    priorDifference = sampleHeight(field, a.x, a.z) - a.y - 0.03;
  if (priorDifference > 0) return 0;
  for (const t of times) {
    meter.spend();
    const x = a.x + (b.x - a.x) * t,
      z = a.z + (b.z - a.z) * t,
      y = a.y + (b.y - a.y) * t;
    const difference = sampleHeight(field, x, z) - y - 0.03;
    if (difference > 0) return priorT + ((t - priorT) * -priorDifference) / (difference - priorDifference);
    priorT = t;
    priorDifference = difference;
  }
  return null;
}
/** Evaluate a sight ray against the exact terrain triangulation and oriented solid occluders. @param snapshot Published geometry. @param a Observer position. @param b Target sample. @param meter Shared job meter. @returns Witness containing the first obstruction. */
export function traceSight(
  snapshot: WorldSnapshot,
  a: V2Point3,
  b: V2Point3,
  meter: V2Meter,
  excludeTargetId?: string
): V2SightSample {
  let hit = terrainHit(snapshot, a, b, meter),
    blocker: string | undefined = hit !== null ? "terrain" : undefined;
  for (const box of [...snapshot.boxes, ...snapshot.pois.map(poiMarkerBox)])
    if (box.occlusion && box.id !== excludeTargetId) {
      meter.spend();
      const t = segmentBoxHit(a, b, box);
      if (t !== null && t >= 0 && t <= 1 && (hit === null || t < hit)) {
        hit = t;
        blocker = box.id;
      }
    }
  return {
    from: a,
    to: b,
    clear: hit === null,
    ...(hit === null
      ? {}
      : { hit: { x: a.x + (b.x - a.x) * hit, y: a.y + (b.y - a.y) * hit, z: a.z + (b.z - a.z) * hit }, blocker })
  };
}
/** Whitebox geometry of a destination marker, shared with rendering and sight checks. @param poi Published destination. @returns Noncolliding, opaque marker box. */
export function poiMarkerBox(poi: WorldSnapshot["pois"][number]): V2PlacedBox {
  return {
    id: poi.id,
    label: poi.label,
    center: { ...(poi.markerPosition ?? poi.position) },
    sizeX: poi.markerWidth ?? 2,
    sizeZ: poi.markerWidth ?? 2,
    sizeY: poi.markerHeight,
    yaw: 0,
    collision: false,
    occlusion: true,
    baseY: poi.markerBaseY ?? poi.y,
    y: (poi.markerBaseY ?? poi.y) + poi.markerHeight / 2
  };
}
/** Sample nine points on the actual front face of the target OBB. @param snapshot Published target geometry. @param from Observer position. @param targetId POI or box identity. @returns Surface points and projected angular height, or null if absent. */
export function targetSamples(
  snapshot: WorldSnapshot,
  from: V2Point3,
  targetId: string
): { points: V2Point3[]; angularSize: number } | null {
  const water = snapshot.waters.find((surface) => surface.id === targetId);
  if (water && water.mesh.indices.length) {
    const p = water.mesh.positions,
      triangles = water.mesh.indices.length / 3,
      points: V2Point3[] = [];
    for (let i = 0; i < Math.min(9, triangles); i++) {
      const offset = Math.floor(((i + 0.5) / Math.min(9, triangles)) * triangles) * 3,
        a = water.mesh.indices[offset] * 3,
        b = water.mesh.indices[offset + 1] * 3,
        c = water.mesh.indices[offset + 2] * 3;
      points.push({
        x: (p[a] + p[b] + p[c]) / 3,
        y: (p[a + 1] + p[b + 1] + p[c + 1]) / 3,
        z: (p[a + 2] + p[b + 2] + p[c + 2]) / 3
      });
    }
    const pitches = points.map((p) => Math.atan2(p.y - from.y, Math.max(0.001, distance(from, p))));
    return { points, angularSize: ((Math.max(...pitches) - Math.min(...pitches)) * 180) / Math.PI };
  }
  const poi = snapshot.pois.find((p) => p.id === targetId),
    box = poi ? poiMarkerBox(poi) : snapshot.boxes.find((b) => b.id === targetId);
  if (!box) return null;
  const c = Math.cos(box.yaw),
    s = Math.sin(box.yaw),
    dx = from.x - box.center.x,
    dz = from.z - box.center.z;
  const localX = dx * c + dz * s,
    localZ = -dx * s + dz * c,
    xFace = Math.abs(localX) / box.sizeX > Math.abs(localZ) / box.sizeZ;
  const points: V2Point3[] = [];
  for (const height of [0.25, 0.6, 0.95])
    for (const side of [-0.7, 0, 0.7]) {
      const x = xFace ? (Math.sign(localX || 1) * box.sizeX) / 2 : (side * box.sizeX) / 2;
      const z = xFace ? (side * box.sizeZ) / 2 : (Math.sign(localZ || 1) * box.sizeZ) / 2;
      points.push({
        x: box.center.x + c * x - s * z,
        z: box.center.z + s * x + c * z,
        y: box.baseY + height * box.sizeY
      });
    }
  const horizontal = Math.max(0.001, distance(from, box.center));
  return {
    points,
    angularSize:
      (Math.abs(Math.atan2(box.baseY + box.sizeY - from.y, horizontal) - Math.atan2(box.baseY - from.y, horizontal)) *
        180) /
      Math.PI
  };
}
/** Evaluate actual target surface samples through the same ray tracer. @param snapshot Shared world. @param from Observer eye position. @param targetId Destination or volume identity. @param meter Shared budget. @returns Sample witnesses and visible fraction. */
export function buildTargetSight(
  snapshot: WorldSnapshot,
  from: V2Point3,
  targetId: string,
  meter: V2Meter
): { samples: V2SightSample[]; visibleFraction: number; angularSize: number } {
  const target = targetSamples(snapshot, from, targetId);
  if (!target) return { samples: [], visibleFraction: 0, angularSize: 0 };
  const samples = target.points.map((to) => traceSight(snapshot, from, to, meter, targetId));
  return {
    samples,
    visibleFraction: samples.filter((s) => s.clear).length / samples.length,
    angularSize: target.angularSize
  };
}
/** Recompute all visual relations from current terrain and volume geometry. @param recipe Resolved authoring intent. @param snapshot Candidate geometry. @param meter Shared job meter. @returns Visibility measurements and witness rays. */
export function buildSights(recipe: WorldRecipe, snapshot: WorldSnapshot, meter: V2Meter): V2Sight[] {
  return recipe.views.map((relation) => {
    const observer =
      relation.from === "spawn"
        ? snapshot.spawn
        : (snapshot.routeNodes?.find((node) => node.id === relation.from) ??
          snapshot.pois.find((p) => p.id === relation.from)!);
    const observerPoint = "position" in observer ? observer.position : observer;
    const from = { x: observerPoint.x, y: observer.y + recipe.player.eyeHeight, z: observerPoint.z };
    return {
      id: relation.id,
      from: relation.from,
      target: relation.target,
      mode: relation.mode,
      ...buildTargetSight(snapshot, from, relation.target, meter)
    };
  });
}

/** Check geometry independently of generator branch decisions. @param recipe Resolved authoring intent. @param snapshot Candidate world. @param meter Shared accounting meter. @returns Hard and soft measured conditions. */
export function validateWithMeter(recipe: WorldRecipe, snapshot: WorldSnapshot, meter: V2Meter): V2Check[] {
  const checks: V2Check[] = [],
    field = snapshot.heightfield,
    step = field.size / (field.resolution - 1);
  const add = (
    id: string,
    category: string,
    hard: boolean,
    passed: boolean,
    measured: number,
    limit: number,
    unit: string,
    message: string
  ) => checks.push({ id, category, hard, passed, measured, limit, unit, message });
  let invalidHeights = 0;
  for (const h of field.heights) {
    meter.spend();
    if (!Number.isFinite(h)) invalidHeights++;
  }
  add(
    "terrain-finite",
    "terrain",
    true,
    invalidHeights === 0 && field.heights.length === field.resolution * field.resolution,
    invalidHeights,
    0,
    "个",
    "地形高度有限且网格尺寸一致"
  );
  let malformedGeometry = 0;
  const finite = (values: number[]) => values.every(Number.isFinite);
  for (const surface of [...snapshot.waters, ...snapshot.roads]) {
    meter.spend(surface.mesh.positions.length + surface.mesh.indices.length);
    const vertexCount = surface.mesh.positions.length / 3;
    if (
      surface.mesh.positions.length % 3 ||
      !finite(surface.mesh.positions) ||
      surface.mesh.indices.length % 3 ||
      surface.mesh.indices.some((id) => !Number.isInteger(id) || id < 0 || id >= vertexCount)
    )
      malformedGeometry++;
  }
  for (const box of snapshot.boxes)
    if (
      !finite([box.center.x, box.center.z, box.baseY, box.y, box.sizeX, box.sizeY, box.sizeZ, box.yaw]) ||
      Math.min(box.sizeX, box.sizeY, box.sizeZ) <= 0
    )
      malformedGeometry++;
  for (const poi of snapshot.pois)
    if (!finite([poi.position.x, poi.position.z, poi.y, poi.radius, poi.markerHeight, poi.markerWidth ?? 2]))
      malformedGeometry++;
  if (!finite([snapshot.spawn.x, snapshot.spawn.y, snapshot.spawn.z, snapshot.size, field.resolution, field.size]))
    malformedGeometry++;
  add(
    "geometry-finite",
    "geometry",
    true,
    malformedGeometry === 0,
    malformedGeometry,
    0,
    "个",
    "网格索引与实体几何均为有效有限数据"
  );
  if (malformedGeometry || invalidHeights || field.heights.length !== field.resolution * field.resolution)
    return checks;
  if (snapshot.terrainBeforeRoads) {
    let maximum = 0;
    for (let i = 0; i < field.heights.length; i++) {
      meter.spend();
      maximum = Math.max(maximum, Math.abs(field.heights[i] - snapshot.terrainBeforeRoads[i]));
    }
    add(
      "road-earthworks",
      "terrain",
      true,
      maximum <= (recipe.earthworks?.maxCutFill ?? 32) + 0.01,
      maximum,
      recipe.earthworks?.maxCutFill ?? 32,
      "米",
      "道路最终挖填量相对构造前地形不超过预算"
    );
  }
  const surfaces = new Set(snapshot.waters.map((w) => w.id));
  for (const r of recipe.rivers)
    add(
      `river-present:${r.id}`,
      "river",
      true,
      surfaces.has(r.id),
      surfaces.has(r.id) ? 1 : 0,
      1,
      "个",
      "请求的河段存在实际水面"
    );
  for (const l of recipe.lakes)
    add(
      `lake-present:${l.id}`,
      "lake",
      true,
      surfaces.has(l.id),
      surfaces.has(l.id) ? 1 : 0,
      1,
      "个",
      "请求的湖泊存在实际水面"
    );
  for (const water of snapshot.waters) {
    meter.spend(water.outline.length * water.outline.length);
    const outside = water.outline.filter(
      (p) => Math.abs(p.x) > snapshot.size / 2 + 1e-6 || Math.abs(p.z) > snapshot.size / 2 + 1e-6
    ).length;
    add(
      `water-domain:${water.id}`,
      "water",
      true,
      outside === 0,
      outside,
      0,
      "个",
      "实际水域边界完全位于地形采样范围内"
    );
    const simple = isSimplePolygon(water.outline);
    add(
      `water-outline:${water.id}`,
      "water",
      true,
      simple && water.mesh.indices.length > 0,
      simple ? 1 : 0,
      1,
      "布尔",
      "水域边界不自交且具有实际三角面"
    );
    let dry = 0,
      maxBed = -Infinity;
    const p = water.mesh.positions;
    for (let i = 0; i < p.length; i += 3) {
      meter.spend();
      const separation = sampleHeight(field, p[i], p[i + 2]) - p[i + 1];
      if (separation > -0.05) dry++;
      maxBed = Math.max(maxBed, separation);
    }
    for (let k = 0; k < water.mesh.indices.length; k += 3) {
      meter.spend();
      const a = water.mesh.indices[k] * 3,
        b = water.mesh.indices[k + 1] * 3,
        c = water.mesh.indices[k + 2] * 3;
      const x = (p[a] + p[b] + p[c]) / 3,
        z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
        y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
      const separation = sampleHeight(field, x, z) - y;
      if (separation > -0.05) dry++;
      maxBed = Math.max(maxBed, separation);
    }
    add(`water-bed:${water.id}`, "water", true, dry === 0, maxBed, -0.05, "米", "水面顶点与三角中心位于实际河床上方");
    let rise = 0;
    for (let i = 1; i < water.centerline.length; i++) {
      meter.spend();
      rise = Math.max(rise, water.centerline[i].y - water.centerline[i - 1].y);
    }
    add(`water-downhill:${water.id}`, "water", true, rise <= 1e-5, rise, 0, "米", "有向河段水面不逆流升高");
  }
  for (const node of recipe.riverNodes) {
    let separation = 0,
      levelError = 0;
    for (const r of recipe.rivers.filter((r) => r.from === node.id || r.to === node.id)) {
      const surface = snapshot.waters.find((s) => s.id === r.id);
      if (!surface?.centerline.length) {
        separation = Infinity;
        continue;
      }
      const end = surface.centerline[r.from === node.id ? 0 : surface.centerline.length - 1];
      separation = Math.max(separation, distance(node, end));
      levelError = Math.max(levelError, Math.abs(node.level - end.y));
    }
    add(
      `river-junction:${node.id}`,
      "river",
      true,
      separation < 0.001 && levelError < 0.001,
      Math.max(separation, levelError),
      0.001,
      "米",
      "分流和汇流端点共享坐标与水位"
    );
  }
  for (const box of snapshot.boxes) {
    meter.spend(Math.ceil(box.sizeX / step + 2) * Math.ceil(box.sizeZ / step + 2) * 8);
    const minSupport = terrainRange(field, boxFootprint(box), (count) => meter.spend(count)).min;
    const gap = Math.abs(box.baseY - (minSupport - 0.05)),
      centerError = Math.abs(box.y - (box.baseY + box.sizeY / 2));
    add(
      `box-ground:${box.id}`,
      "box",
      true,
      gap < 0.01 && centerError < 0.01,
      Math.max(gap, centerError),
      0.01,
      "米",
      "白盒支撑与中心变换匹配实际地形"
    );
  }
  const footprint = (x: number, z: number, radius: number, maxSlope: number) => {
    const result = measureCorridor(snapshot, { x, z }, { x, z }, radius, (count) => meter.spend(count));
    return { pass: result.clearance >= radius - 1e-5 && result.slope <= maxSlope + 1e-5, ...result };
  };
  const spawn = footprint(snapshot.spawn.x, snapshot.spawn.z, recipe.player.radius, recipe.player.maxSlope);
  add(
    "spawn-support",
    "navigation",
    true,
    spawn.pass,
    spawn.slope,
    recipe.player.maxSlope,
    "rise/run",
    "出生点支撑坡度、水域与占用净距有效"
  );
  add(
    "spawn-ground",
    "navigation",
    true,
    Math.abs(snapshot.spawn.y - sampleHeight(field, snapshot.spawn.x, snapshot.spawn.z)) < 0.01,
    Math.abs(snapshot.spawn.y - sampleHeight(field, snapshot.spawn.x, snapshot.spawn.z)),
    0.01,
    "米",
    "出生点海拔匹配地形"
  );
  for (const poi of snapshot.pois) {
    if (poi.outline) continue;
    const measurement = footprint(poi.position.x, poi.position.z, poi.radius, recipe.player.maxSlope);
    add(
      `poi-space:${poi.id}`,
      "poi",
      true,
      measurement.pass,
      measurement.slope,
      recipe.player.maxSlope,
      "rise/run",
      "POI 停留区具有净宽和可站立坡面"
    );
    add(
      `poi-ground:${poi.id}`,
      "poi",
      true,
      Math.abs(poi.y - sampleHeight(field, poi.position.x, poi.position.z)) < 0.01,
      Math.abs(poi.y - sampleHeight(field, poi.position.x, poi.position.z)),
      0.01,
      "米",
      "POI 高程与实际地表一致"
    );
  }
  for (const request of recipe.routes) {
    const road = snapshot.roads.find((r) => r.id === request.id);
    if (!road) {
      add(`road-present:${request.id}`, "route", true, false, 0, 1, "个", "动线缺少实际连续几何");
      continue;
    }
    const endpoint = (id: string) =>
      id === "spawn"
        ? recipe.spawn
        : (recipe.routeNodes?.find((node) => node.id === id)?.position ??
          recipe.pois.find((p) => p.id === id)?.position);
    const start = endpoint(request.from),
      end = endpoint(request.to);
    const error = Math.max(
      start && road.centerline.length ? distance(start, road.centerline[0]) : Infinity,
      end && road.centerline.length ? distance(end, road.centerline[road.centerline.length - 1]) : Infinity
    );
    add(
      `road-endpoints:${road.id}`,
      "route",
      true,
      error < 0.01 && road.mesh.indices.length > 0,
      error,
      0.01,
      "米",
      "道路连到声明的两个端点"
    );
    if (request.pointSupportIds || request.pointHeights) {
      const supports = snapshot.boxes.filter((box) => request.supportBoxIds?.includes(box.id));
      let unsupported = 0;
      for (const p of road.centerline) {
        meter.spend(supports.length + 1);
        const onGround = Math.abs(p.y - sampleHeight(field, p.x, p.z)) < 0.1;
        const onVolume = supports.some(
          (box) => distanceToBox(box, p.x, p.z) <= 0 && Math.abs(p.y - box.baseY - box.sizeY) < 0.1
        );
        if (!onGround && !onVolume) unsupported++;
      }
      add(
        `route-support-samples:${road.id}`,
        "route",
        false,
        unsupported === 0,
        unsupported,
        0,
        "点",
        "高架动线采样与实际支撑面接触；插值坡段仍需桥面或坡道支撑"
      );
      continue;
    }
    let bad = 0,
      maxSlope = 0,
      minClearance = Infinity,
      maxGroundError = 0,
      unsupportedTriangles = 0;
    for (let i = 0; i < road.centerline.length; i++) {
      const p = road.centerline[i],
        radius = request.width / 2 + recipe.player.radius;
      const continuous = measureCorridor(snapshot, road.centerline[Math.max(0, i - 1)], p, radius, (count) =>
        meter.spend(count)
      );
      const limit = Math.min(request.maxSlope, recipe.player.maxSlope);
      const result = { ...continuous, pass: continuous.clearance >= radius - 1e-5 && continuous.slope <= limit + 1e-5 };
      minClearance = Math.min(minClearance, result.clearance);
      maxSlope = Math.max(maxSlope, result.slope);
      if (!result.pass) bad++;
      maxGroundError = Math.max(maxGroundError, Math.abs(p.y - sampleHeight(field, p.x, p.z)));
      if (i > 0 && distance(p, road.centerline[i - 1]) > step * 0.6) bad++;
    }
    for (let i = 0; i < road.mesh.positions.length; i += 3) {
      meter.spend();
      const p = road.mesh.positions;
      maxGroundError = Math.max(maxGroundError, Math.abs(p[i + 1] - sampleHeight(field, p[i], p[i + 2])));
    }
    for (let k = 0; k < road.mesh.indices.length; k += 3) {
      meter.spend();
      const a = road.mesh.indices[k] * 3,
        b = road.mesh.indices[k + 1] * 3,
        c = road.mesh.indices[k + 2] * 3,
        p = road.mesh.positions;
      const x = (p[a] + p[b] + p[c]) / 3,
        z = (p[a + 2] + p[b + 2] + p[c + 2]) / 3,
        y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
      maxGroundError = Math.max(maxGroundError, Math.abs(y - sampleHeight(field, x, z)));
      const gx = (x / field.size + 0.5) * (field.resolution - 1),
        gz = (z / field.size + 0.5) * (field.resolution - 1),
        ix = Math.min(field.resolution - 2, Math.floor(gx)),
        iz = Math.min(field.resolution - 2, Math.floor(gz));
      const lowerTriangle = gx - ix + gz - iz <= 1;
      for (const vertex of [a, b, c]) {
        const tx = (p[vertex] / field.size + 0.5) * (field.resolution - 1) - ix,
          tz = (p[vertex + 2] / field.size + 0.5) * (field.resolution - 1) - iz;
        if (
          tx < -1e-5 ||
          tx > 1 + 1e-5 ||
          tz < -1e-5 ||
          tz > 1 + 1e-5 ||
          (lowerTriangle ? tx + tz > 1 + 1e-5 : tx + tz < 1 - 1e-5)
        ) {
          unsupportedTriangles++;
          break;
        }
      }
    }
    add(
      `road-triangulation:${road.id}`,
      "route",
      true,
      unsupportedTriangles === 0,
      unsupportedTriangles,
      0,
      "个",
      "道路每个三角完全落在单个地形三角面内"
    );
    add(
      `road-corridor:${road.id}`,
      "route",
      true,
      bad === 0,
      minClearance,
      request.width / 2 + recipe.player.radius,
      "米",
      "整段胶囊通廊保持水域与障碍净距"
    );
    add(
      `road-slope:${road.id}`,
      "route",
      true,
      maxSlope <= Math.min(request.maxSlope, recipe.player.maxSlope) + 1e-5,
      maxSlope,
      Math.min(request.maxSlope, recipe.player.maxSlope),
      "rise/run",
      "道路全宽相交地形三角坡度不超过阈值"
    );
    add(
      `road-ground:${road.id}`,
      "route",
      true,
      maxGroundError < 0.01,
      maxGroundError,
      0.01,
      "米",
      "道路所有顶点与最终地形相接"
    );
  }
  const reachable = new Set<string>(["spawn"]);
  for (let i = 0; i <= (recipe.routeNodes?.length ?? 0) + recipe.pois.length; i++)
    for (const r of snapshot.roads) {
      meter.spend();
      if (reachable.has(r.from)) reachable.add(r.to);
      if (reachable.has(r.to)) reachable.add(r.from);
    }
  for (const poi of snapshot.pois)
    add(
      `poi-connected:${poi.id}`,
      "route",
      true,
      poi.entrances?.some((entry) => reachable.has(entry.routeNodeId)) ?? reachable.has(poi.id),
      (poi.entrances?.some((entry) => reachable.has(entry.routeNodeId)) ?? reachable.has(poi.id)) ? 1 : 0,
      1,
      "布尔",
      "场所入口与出生点通路图连接；图连接不代替角色通行验证"
    );
  const sights = buildSights(recipe, snapshot, meter);
  for (const sight of sights) {
    const request = recipe.views.find((v) => v.id === sight.id)!;
    const fraction = request.mode === "screened" ? 1 - sight.visibleFraction : sight.visibleFraction;
    add(
      `sight:${sight.id}`,
      "sight",
      request.hard,
      fraction >= request.minimum - 1e-6 && fraction <= request.maximum + 1e-6,
      fraction,
      request.minimum,
      "比例",
      request.mode === "screened" ? "目标采样遮挡率满足关系区间" : "目标采样可见率满足关系区间"
    );
    const stored = snapshot.sights.find((s) => s.id === sight.id);
    add(
      `sight-fresh:${sight.id}`,
      "sight",
      true,
      !!stored && Math.abs(stored.visibleFraction - sight.visibleFraction) < 1e-6,
      stored ? Math.abs(stored.visibleFraction - sight.visibleFraction) : 1,
      0,
      "比例",
      "保存的视线诊断与实际几何复算一致"
    );
  }
  return checks;
}
/** Public independent audit that never repairs or republishes a world. @param recipe Resolved recipe, or authoring recipe without active group transforms. @param snapshot World to audit. @param budget Audit work limits. @returns Fresh report; failure leaves its input untouched. */
export function validateSnapshot(
  recipe: WorldRecipe,
  snapshot: WorldSnapshot,
  budget: V2Budget = DEFAULT_V2_BUDGET
): ValidationReport {
  const meter = new V2Meter(budget),
    report: ValidationReport = {
      status: "valid",
      published: false,
      intentSatisfied: false,
      checks: [],
      messages: [],
      operations: 0,
      searchExpansions: 0,
      durationMs: 0,
      candidateCount: 0,
      impact: {
        changedIds: [],
        affectedIds: [],
        bounds: null,
        changedHeightSamples: 0,
        totalHeightSamples: snapshot.heightfield.heights.length
      },
      adjusted: []
    };
  try {
    report.checks = validateWithMeter(resolveRecipe(recipe), snapshot, meter);
    report.status = report.checks.some((c) => c.hard && !c.passed) ? "invalid-input" : "valid";
    report.intentSatisfied = report.checks.every((c) => c.passed);
  } catch (error) {
    report.status = error instanceof V2BudgetExceeded ? "not-found-within-budget" : "invalid-input";
    report.messages.push(error instanceof Error ? error.message : String(error));
  }
  report.operations = meter.operations;
  report.searchExpansions = meter.searchExpansions;
  report.durationMs = performance.now() - meter.start;
  return report;
}

/** Validate only finite data and safe mesh buffers during interactive authoring. @param recipe Authoring input. @param snapshot Candidate output. @param meter Shared job meter. @returns Safety checks; layout preferences never reject an edit here. */
export function validateDataSafety(recipe: WorldRecipe, snapshot: WorldSnapshot, meter: V2Meter): V2Check[] {
  let invalid = 0;
  for (const h of snapshot.heightfield.heights) {
    meter.spend();
    if (!Number.isFinite(h)) invalid++;
  }
  if (snapshot.heightfield.heights.length !== snapshot.heightfield.resolution ** 2) invalid++;
  for (const object of [...snapshot.waters, ...snapshot.roads]) {
    meter.spend(object.mesh.positions.length + object.mesh.indices.length);
    const count = object.mesh.positions.length / 3;
    if (
      !object.mesh.positions.every(Number.isFinite) ||
      object.mesh.positions.length % 3 ||
      object.mesh.indices.some((index) => !Number.isInteger(index) || index < 0 || index >= count) ||
      object.mesh.indices.length % 3
    )
      invalid++;
  }
  for (const box of snapshot.boxes)
    if (
      ![box.center.x, box.center.z, box.baseY, box.y, box.sizeX, box.sizeY, box.sizeZ, box.yaw].every(Number.isFinite)
    )
      invalid++;
  const alpha = snapshot.alphamap;
  if (alpha && alpha.weights.length !== alpha.resolution * alpha.resolution * 4) invalid++;
  return [
    {
      id: "data-safety",
      category: "data",
      hard: true,
      passed: invalid === 0,
      measured: invalid,
      limit: 0,
      unit: "个",
      message: "高度、体量与网格缓冲区为有效有限数据"
    }
  ];
}
