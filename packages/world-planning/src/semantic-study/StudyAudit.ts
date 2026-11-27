import { V2Meter } from "../geometry/V2Budget";
import {
  boxFootprint,
  distanceToBox,
  pointInPolygon,
  polygonDistance,
  sampleMesh,
  triangulatePolygon
} from "../geometry/V2Geometry";
import { V2SpatialIndex } from "../geometry/V2SpatialIndex";
import { buildTargetSight } from "../geometry/V2Validation";
import type { V2PlacedBox, V2Point, V2Point3, WorldSnapshot } from "../spatial/V2Model.ts";
import type { StudyCompileResult, StudyDefinition, StudyMass } from "./StudyModel";

/** One measured geometric condition; info rows deliberately have no aesthetic pass threshold. */
export interface StudyAuditCheck {
  id: string;
  category: "compile" | "route" | "water" | "poi" | "sight" | "mass";
  status: "pass" | "fail" | "info";
  label: string;
  /** Actual result; null means the required geometry was absent. */
  measured: number | null;
  unit: string;
  details: string;
}

/** Audited geometry and raw quality measurements, independent of the native publication status. */
export interface StudyAuditResult {
  checks: StudyAuditCheck[];
  failed: StudyAuditCheck[];
  /** Named measurements suitable for baseline/change/recovery comparison. */
  metrics: Record<string, number>;
}

const POSITION_EPSILON = 1e-4;

/**
 * Inspect actual compiled endpoints, confluences, entrances, sight rays, and polygon coverage.
 * @param definition Authored spatial objects and explicit relation expectations.
 * @param result Compilation transaction; an unpublished retained snapshot cannot pass this audit.
 * @returns Measured checks and failures. Sampling coverage and visual ratios do not certify beauty or passage.
 */
export function auditStudy(definition: StudyDefinition, result: StudyCompileResult): StudyAuditResult {
  const checks: StudyAuditCheck[] = [],
    metrics: Record<string, number> = {};
  const add = (
    id: string,
    category: StudyAuditCheck["category"],
    label: string,
    measured: number | null,
    unit: string,
    passed: boolean | null,
    details: string
  ) => {
    checks.push({
      id,
      category,
      label,
      measured,
      unit,
      status: passed === null ? "info" : passed ? "pass" : "fail",
      details
    });
    if (measured !== null && Number.isFinite(measured)) metrics[id] = measured;
  };
  const done = (): StudyAuditResult => ({ checks, failed: checks.filter((check) => check.status === "fail"), metrics });
  const snapshot = result.snapshot;
  add(
    "compile:published",
    "compile",
    "本次候选已发布",
    result.report.published ? 1 : 0,
    "",
    result.report.published && !!snapshot,
    result.report.messages.join("；") || result.report.status
  );
  if (!result.report.published || !snapshot) return done();

  const routeEnds = new Map<string, V2Point3[]>();
  for (const request of result.recipe.routes) {
    const road = snapshot.roads.find((road) => road.id === request.id);
    const valid = !!road && road.centerline.length >= 2 && road.centerline.every(finitePoint);
    add(
      `route:${request.id}:geometry`,
      "route",
      `${request.label} 几何`,
      road?.centerline.length ?? 0,
      "点",
      valid,
      "至少两个有限坐标点"
    );
    if (!valid || !road) continue;
    for (const [side, nodeId, endpoint] of [
      ["from", request.from, road.centerline[0]],
      ["to", request.to, road.centerline[road.centerline.length - 1]]
    ] as const) {
      const anchor = routeAnchor(snapshot, nodeId),
        gap = anchor ? horizontalDistance(endpoint, anchor) : null;
      add(
        `route:${request.id}:${side}`,
        "route",
        `${request.label} ${side} 端点`,
        gap,
        "m",
        gap !== null && gap <= POSITION_EPSILON,
        `实际路线端点与 ${nodeId} 的 XZ 位置；数值容差 ${POSITION_EPSILON} m`
      );
      if (anchor)
        add(
          `route:${request.id}:${side}:height`,
          "route",
          `${request.label} ${side} 高差`,
          endpoint.y - anchor.y,
          "m",
          null,
          "实际路面与节点高差，单列记录地面/路面偏移，不据此断言可行走"
        );
      const endpoints = routeEnds.get(nodeId) ?? [];
      endpoints.push(endpoint);
      routeEnds.set(nodeId, endpoints);
    }
    add(
      `route:${request.id}:length`,
      "route",
      `${request.label} 几何长度`,
      lineLength(road.centerline),
      "m",
      null,
      "由实际三维折线重新求和，不代表探索节奏或通行通过"
    );
  }
  for (const [node, endpoints] of routeEnds)
    if (endpoints.length > 1) {
      const gap = maximumSeparation(endpoints);
      add(
        `route:join:${node}`,
        "route",
        `${node} 路线接合`,
        gap,
        "m",
        gap <= POSITION_EPSILON,
        "共享节点的各条实际路线端点必须在 XYZ 接合；同名 ID 不构成几何连接"
      );
    }

  const riverEnds = new Map<string, V2Point3[]>();
  for (const reach of result.recipe.rivers) {
    const water = snapshot.waters.find((water) => water.id === reach.id);
    const valid = !!water && water.centerline.length >= 2 && water.centerline.every(finitePoint);
    add(
      `water:${reach.id}:geometry`,
      "water",
      `${reach.label} 几何`,
      water?.centerline.length ?? 0,
      "点",
      valid,
      "实际河段中心线存在"
    );
    if (!valid || !water) continue;
    for (const [side, nodeId, endpoint] of [
      ["from", reach.from, water.centerline[0]],
      ["to", reach.to, water.centerline[water.centerline.length - 1]]
    ] as const) {
      const node = result.recipe.riverNodes.find((node) => node.id === nodeId);
      const gap = node ? horizontalDistance(node, endpoint) : null;
      add(
        `water:${reach.id}:${side}`,
        "water",
        `${reach.label} ${side} 水节点`,
        gap,
        "m",
        gap !== null && gap <= POSITION_EPSILON,
        `实际河段端点与 ${nodeId} 的位置`
      );
      const endpoints = riverEnds.get(nodeId) ?? [];
      endpoints.push(endpoint);
      riverEnds.set(nodeId, endpoints);
    }
    if (reach.lakeId) {
      const lake = snapshot.waters.find((surface) => surface.id === reach.lakeId && surface.kind === "lake");
      const mouth = water.centerline[water.centerline.length - 1];
      const lakeY = lake ? sampleMesh(lake.mesh, mouth.x, mouth.z) : null;
      add(
        `water:${reach.id}:lakePosition`,
        "water",
        `${reach.label} 入湖位置`,
        lakeY === null ? null : 0,
        "m",
        lakeY !== null,
        `${reach.lakeId} 的实际水面三角形必须覆盖河段末点，引用 lakeId 不代表已经接上`
      );
      const levelGap = lakeY === null ? null : Math.abs(mouth.y - lakeY);
      add(
        `water:${reach.id}:lakeLevel`,
        "water",
        `${reach.label} 入湖水位`,
        levelGap,
        "m",
        levelGap !== null && levelGap <= POSITION_EPSILON,
        "实际河段末点水位与该处实际湖面水位比较，不读取输入 level 代替几何"
      );
    }
  }
  for (const [node, endpoints] of riverEnds)
    if (endpoints.length > 1) {
      const horizontalGap = maximumSeparation(endpoints.map((p) => ({ ...p, y: 0 })));
      const levelGap = Math.max(...endpoints.map((p) => p.y)) - Math.min(...endpoints.map((p) => p.y));
      add(
        `water:join:${node}:position`,
        "water",
        `${node} 汇流位置`,
        horizontalGap,
        "m",
        horizontalGap <= POSITION_EPSILON,
        "真实相接河段的端点位置"
      );
      add(
        `water:join:${node}:level`,
        "water",
        `${node} 汇流水位`,
        levelGap,
        "m",
        levelGap <= POSITION_EPSILON,
        "真实相接河段的端点水面高程"
      );
    }

  for (const request of result.recipe.pois) {
    const poi = snapshot.pois.find((poi) => poi.id === request.id);
    add(`poi:${request.id}:geometry`, "poi", `${request.label} 场所`, poi ? 1 : 0, "", !!poi, "场所与路网节点分开存在");
    for (const entrance of request.entrances ?? []) {
      const placed = poi?.entrances?.find((candidate) => candidate.id === entrance.id);
      const node = routeAnchor(snapshot, entrance.routeNodeId);
      const gap = placed && node ? horizontalDistance(placed.position, node) : null;
      add(
        `poi:${request.id}:entrance:${entrance.id}`,
        "poi",
        `${request.label} ${entrance.id}`,
        gap,
        "m",
        gap !== null && gap <= POSITION_EPSILON,
        `入口真实位置与 ${entrance.routeNodeId} 对齐`
      );
      const arrivals = (request.arrivalRouteIds ?? []).map((id) => snapshot.roads.find((road) => road.id === id));
      const endpoints = arrivals.flatMap((road) =>
        !road?.centerline.length
          ? []
          : [
              road.from === entrance.routeNodeId ? road.centerline[0] : null,
              road.to === entrance.routeNodeId ? road.centerline[road.centerline.length - 1] : null
            ].filter((p): p is V2Point3 => !!p)
      );
      const roadGap =
        placed && endpoints.length ? Math.min(...endpoints.map((p) => horizontalDistance(p, placed.position))) : null;
      add(
        `poi:${request.id}:arrival:${entrance.id}`,
        "poi",
        `${request.label} 指定到达通路`,
        roadGap,
        "m",
        roadGap !== null && roadGap <= POSITION_EPSILON,
        "arrivalRouteIds 中至少一条真实通路端点与入口接合"
      );
    }
  }

  const meter = new V2Meter();
  for (const relation of result.recipe.views) {
    const anchor = routeAnchor(snapshot, relation.from);
    if (!anchor) {
      add(`sight:${relation.id}:observer`, "sight", "视线观察点", null, "", false, `${relation.from} 不存在`);
      continue;
    }
    try {
      const eye = { ...anchor, y: anchor.y + snapshot.player.eyeHeight };
      const embedded = snapshot.boxes.filter((box) => box.occlusion && insideVolume(box, eye));
      add(
        `sight:${relation.id}:observerVolume`,
        "sight",
        `${relation.from} 观察点净空`,
        embedded.length,
        "体",
        embedded.length === 0,
        embedded.length
          ? `观察点落在实际遮挡体内部：${embedded.map((box) => box.id).join(", ")}`
          : "不能把观察点埋在墙内当作正常遮挡"
      );
      const actual = buildTargetSight(snapshot, eye, relation.target, meter);
      const cached = snapshot.sights.find((sight) => sight.id === relation.id);
      add(
        `sight:${relation.id}:samples`,
        "sight",
        `${relation.from} → ${relation.target} 射线`,
        actual.samples.length,
        "条",
        actual.samples.length > 0 && !!cached?.samples.length,
        "由当前几何重算，空目标/空射线不能通过"
      );
      add(
        `sight:${relation.id}:visible`,
        "sight",
        `${relation.from} → ${relation.target} 可见比例`,
        actual.visibleFraction,
        "比例",
        actual.samples.length > 0 &&
          actual.visibleFraction >= relation.minimum &&
          actual.visibleFraction <= relation.maximum,
        `仅核对该关系声明的 [${relation.minimum}, ${relation.maximum}]，不是通用审美阈值`
      );
      const difference = cached ? Math.abs(cached.visibleFraction - actual.visibleFraction) : null;
      add(
        `sight:${relation.id}:fresh`,
        "sight",
        "缓存与实际视线一致",
        difference,
        "比例",
        difference !== null && difference <= POSITION_EPSILON,
        "防止沿用旧的视线比例掩盖当前遮挡变化"
      );
    } catch (error) {
      add(
        `sight:${relation.id}:budget`,
        "sight",
        "视线审计完成",
        null,
        "",
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  for (const mass of definition.masses) {
    const group = result.recipe.groups?.find((group) => group.id === mass.id);
    const ids = new Set(group?.memberIds ?? []),
      columns = snapshot.boxes.filter((box) => ids.has(box.id));
    const expectsColumns = mass.height > 0 && (!mass.profile || mass.profile.some((height) => height > 0));
    add(
      `mass:${mass.id}:columns`,
      "mass",
      `${mass.label} 支柱`,
      columns.length,
      "个",
      !!group && columns.length === ids.size && (expectsColumns ? columns.length > 0 : columns.length === 0),
      "所有已编译成员在快照中存在；正高度轮廓不能成为空组"
    );
    if (mass.height === 0 || !columns.length) continue;
    const boundaryExpansion = Math.max(
      ...columns.flatMap((box) => boxFootprint(box).map((p) => polygonDistance(p, mass.outline)))
    );
    add(
      `mass:${mass.id}:outside`,
      "mass",
      `${mass.label} 最大边界外扩`,
      boundaryExpansion,
      "m",
      boundaryExpansion <= Math.SQRT2 * mass.cellSize + POSITION_EPSILON,
      "保守格覆盖的外扩上界为 sqrt(2) × cellSize，不能在轮廓外远处散柱"
    );
    const coverage = massCoverage(mass, columns);
    add(
      `mass:${mass.id}:coverage`,
      "mass",
      `${mass.label} 轮廓覆盖`,
      coverage.total ? coverage.covered / coverage.total : null,
      "比例",
      coverage.total > 0 && coverage.covered + coverage.holeBoundaryGaps === coverage.total,
      `${coverage.covered}/${coverage.total} 个内部采样被实际体量覆盖；洞边保守跳格损失 ${coverage.holeBoundaryGaps} 点（距洞 ≤sqrt(2)×cellSize）；采样间隔 ${coverage.spacing} m，有限采样不等于连续覆盖证明`
    );
    add(
      `mass:${mass.id}:holeBoundaryGaps`,
      "mass",
      `${mass.label} 洞边离散损失`,
      coverage.holeBoundaryGaps,
      "采样点",
      null,
      "按实际未覆盖数记录，不将洞边离散损失伪装成100%覆盖"
    );
    if (mass.holes?.length) {
      const overlap = columns.reduce(
        (sum, box) => sum + mass.holes!.reduce((area, hole) => area + boxPolygonOverlapArea(box, hole), 0),
        0
      );
      add(
        `mass:${mass.id}:holeIntrusion`,
        "mass",
        `${mass.label} 洞内实体侵入`,
        overlap,
        "m²",
        overlap <= 1e-8,
        "独立三角化洞轮廓并裁切真实柱体足迹；仅数值面积误差可忽略，不能封填明确空洞"
      );
    }
    add(
      `mass:${mass.id}:area`,
      "mass",
      `${mass.label} 支柱占地`,
      columns.reduce((sum, box) => sum + box.sizeX * box.sizeZ, 0),
      "m²",
      null,
      "实际柱体足迹面积之和；边缘保守覆盖可能超出原多边形"
    );
  }
  return done();
}

function routeAnchor(snapshot: WorldSnapshot, id: string): V2Point3 | undefined {
  if (id === "spawn") return snapshot.spawn;
  const object = snapshot.routeNodes?.find((node) => node.id === id) ?? snapshot.pois.find((poi) => poi.id === id);
  return object ? { ...object.position, y: object.y } : undefined;
}

function massCoverage(
  mass: StudyMass,
  boxes: V2PlacedBox[]
): { covered: number; total: number; spacing: number; holeBoundaryGaps: number } {
  const minX = Math.min(...mass.outline.map((p) => p.x)),
    maxX = Math.max(...mass.outline.map((p) => p.x));
  const minZ = Math.min(...mass.outline.map((p) => p.z)),
    maxZ = Math.max(...mass.outline.map((p) => p.z));
  const spacing = Math.max(mass.cellSize / 2, Math.max(maxX - minX, maxZ - minZ) / 128);
  const index = new V2SpatialIndex<V2PlacedBox>();
  for (const box of boxes) {
    const corners = boxFootprint(box);
    index.add(box, {
      minX: Math.min(...corners.map((p) => p.x)),
      maxX: Math.max(...corners.map((p) => p.x)),
      minZ: Math.min(...corners.map((p) => p.z)),
      maxZ: Math.max(...corners.map((p) => p.z))
    });
  }
  let total = 0,
    covered = 0,
    holeBoundaryGaps = 0;
  const sample = (x: number, z: number) => {
    if (!pointInPolygon({ x, z }, mass.outline)) return;
    if (mass.holes?.some((hole) => polygonDistance({ x, z }, hole) <= POSITION_EPSILON)) return;
    if (mass.profile) {
      const at = ((x - minX) / (maxX - minX)) * (mass.profile.length - 1),
        left = Math.floor(at),
        right = Math.min(left + 1, mass.profile.length - 1);
      if (mass.profile[left] * (right - at) + mass.profile[right] * (at - left) <= 0 && left !== right) return;
      if (left === right && mass.profile[left] <= 0) return;
    }
    total++;
    if (index.query({ minX: x, maxX: x, minZ: z, maxZ: z }).some((box) => distanceToBox(box, x, z) <= POSITION_EPSILON))
      covered++;
    else if (
      mass.holes?.some((hole) => polygonDistance({ x, z }, hole) <= Math.SQRT2 * mass.cellSize + POSITION_EPSILON)
    )
      holeBoundaryGaps++;
  };
  for (let z = minZ + spacing / 2; z < maxZ; z += spacing)
    for (let x = minX + spacing / 2; x < maxX; x += spacing) sample(x, z);
  const mesh = triangulatePolygon(mass.outline, 0);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = mesh.indices.slice(i, i + 3);
    sample(
      ids.reduce((sum, id) => sum + mesh.positions[id * 3], 0) / 3,
      ids.reduce((sum, id) => sum + mesh.positions[id * 3 + 2], 0) / 3
    );
  }
  return { covered, total, spacing, holeBoundaryGaps };
}

function boxPolygonOverlapArea(box: V2PlacedBox, polygon: V2Point[]): number {
  const c = Math.cos(box.yaw),
    s = Math.sin(box.yaw),
    mesh = triangulatePolygon(polygon, 0);
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    let points = mesh.indices.slice(i, i + 3).map((id) => {
      const x = mesh.positions[id * 3] - box.center.x,
        z = mesh.positions[id * 3 + 2] - box.center.z;
      return { x: x * c + z * s, z: -x * s + z * c };
    });
    for (const [axis, bound, sign] of [
      ["x", -box.sizeX / 2, 1],
      ["x", box.sizeX / 2, -1],
      ["z", -box.sizeZ / 2, 1],
      ["z", box.sizeZ / 2, -1]
    ] as const) {
      const next: V2Point[] = [];
      for (let j = 0; j < points.length; j++) {
        const a = points[j],
          b = points[(j + 1) % points.length];
        const insideA = (a[axis] - bound) * sign >= 0,
          insideB = (b[axis] - bound) * sign >= 0;
        if (insideA) next.push(a);
        if (insideA !== insideB) {
          const t = (bound - a[axis]) / (b[axis] - a[axis]);
          next.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        }
      }
      points = next;
    }
    area +=
      Math.abs(
        points.reduce((sum, p, j) => {
          const q = points[(j + 1) % points.length];
          return sum + p.x * q.z - p.z * q.x;
        }, 0)
      ) / 2;
  }
  return area;
}

function horizontalDistance(a: V2Point, b: V2Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function insideVolume(box: V2PlacedBox, point: V2Point3): boolean {
  const dx = point.x - box.center.x,
    dz = point.z - box.center.z,
    c = Math.cos(box.yaw),
    s = Math.sin(box.yaw);
  return (
    Math.abs(dx * c + dz * s) < box.sizeX / 2 - POSITION_EPSILON &&
    Math.abs(-dx * s + dz * c) < box.sizeZ / 2 - POSITION_EPSILON &&
    point.y > box.baseY + POSITION_EPSILON &&
    point.y < box.baseY + box.sizeY - POSITION_EPSILON
  );
}
function distance3(a: V2Point3, b: V2Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function finitePoint(p: V2Point3): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}
function lineLength(points: V2Point3[]): number {
  return points.reduce((sum, p, i) => sum + (i ? distance3(points[i - 1], p) : 0), 0);
}
function maximumSeparation(points: V2Point3[]): number {
  let maximum = 0;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) maximum = Math.max(maximum, distance3(points[i], points[j]));
  return maximum;
}
