import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { PlanningCheck, PlanningProfile } from "./WorldPlanningContract";
import { WorldPlanningWaterQuery } from "./WorldPlanningWaterQuery";
import { inRing, segmentGap } from "./WorldPlanningGeometry";

const gap = (a: PlanPoint, b: PlanPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const epsilon = 0.01;
function levelAt(profile: PlanningProfile, p: PlanPoint): number {
  let height = profile.points[0]?.y ?? NaN,
    best = Infinity;
  for (let i = 1; i < profile.points.length; i++) {
    const a = profile.points[i - 1],
      b = profile.points[i],
      dx = b.x - a.x,
      dz = b.z - a.z,
      t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1))),
      d = segmentGap(p, a, b);
    if (d < best) {
      best = d;
      height = a.y + (b.y - a.y) * t;
    }
  }
  return height;
}
function intersectsOutsideNode(
  a: PlanPoint[],
  b: PlanPoint[],
  node: PlanPoint,
  radius: number,
  query: WorldPlanningWaterQuery
): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length],
      dx = q.x - p.x,
      dz = q.z - p.z,
      x = p.x - node.x,
      z = p.z - node.z,
      A = dx * dx + dz * dz,
      B = 2 * (x * dx + z * dz),
      C = x * x + z * z - radius * radius,
      D = B * B - 4 * A * C;
    const cuts = [0, 1],
      at = (t: number) => ({ x: p.x + dx * t, z: p.z + dz * t });
    if (A > 0 && D > 0)
      for (const t of [(-B - Math.sqrt(D)) / (2 * A), (-B + Math.sqrt(D)) / (2 * A)]) if (t > 0 && t < 1) cuts.push(t);
    cuts.sort((x, y) => x - y);
    for (let j = 1; j < cuts.length; j++)
      if (
        gap(at((cuts[j - 1] + cuts[j]) / 2), node) > radius &&
        query.segmentNear(at(cuts[j - 1]), at(cuts[j]), b, epsilon, true)
      )
        return true;
  }
  return false;
}
/** Audit water topology, shared heights and bank bounds from candidate geometry and original demands.
 * @param plan Resolved 2D planning snapshot, including water profiles and shared ports.
 * @returns Independent required checks; absent height evidence returns unknown.
 */
export function auditPlanningWater(plan: IslandPlan): PlanningCheck[] {
  const data = plan.planning;
  if (!data)
    return [
      {
        id: "audit-water-contract",
        rule: "W01",
        owners: [],
        status: "unknown",
        required: true,
        message: "水系缺少规划契约"
      }
    ];
  const query = new WorldPlanningWaterQuery();
  const checks: PlanningCheck[] = [];
  const add = (
    id: string,
    rule: string,
    owners: string[],
    pass: boolean | undefined,
    message: string,
    position?: PlanPoint
  ) =>
    checks.push({
      id: `audit-${id}`,
      rule,
      owners,
      status: pass === undefined ? "unknown" : pass ? "pass" : "fail",
      required: true,
      message,
      position
    });
  const waterById = new Map(plan.waters.map((w) => [w.id, w]));
  if (plan.waters.some((w) => w.systemId)) {
    for (const w of plan.waters) {
      const root = waterById.get(w.systemId ?? ""),
        module = data.modules.find((m) => m.id === w.id),
        owner = data.modules.find((m) => m.id === w.systemId);
      const receiver = w.to === "ocean" ? undefined : waterById.get(w.to ?? "");
      const valid =
        !!root &&
        root.to === "ocean" &&
        root.systemId === root.id &&
        !!owner?.memberIds?.includes(w.id) &&
        (w.id === root.id ? !module?.ownerId : module?.ownerId === root.id) &&
        (!receiver || receiver.systemId === w.systemId);
      add(
        `water-system-${w.id}`,
        "W01",
        [w.systemId ?? w.id, w.id],
        valid,
        "每个河湖实体归属一个实际连通的可编辑主水系"
      );
    }
  }
  const profile = (id: string) => data.profiles.find((p) => p.ownerId === id && p.kind === "water");
  const connectedPairs = new Set<string>();
  for (const id of data.requiredIds.filter((id) => /^river-|^lake-/.test(id)))
    add(`water-required-${id}`, "W01", [id], waterById.has(id), "原始必需水体存在，未以模块记录替代几何");
  for (const w of plan.waters) {
    const surface = profile(w.id),
      bed = data.profiles.find((p) => p.ownerId === w.id && p.kind === "bed");
    const points = surface?.points ?? [],
      line = w.centerline;
    const shapeMatches =
      w.kind === "lake"
        ? points.length > 0
        : !!line && points.length === line.length && points.every((p, i) => gap(p, line[i]) <= epsilon);
    const levels =
      !!surface &&
      !!bed &&
      points.length > 0 &&
      points.length === bed.points.length &&
      surface.width > 0 &&
      Number.isFinite(surface.width) &&
      shapeMatches &&
      points.every(
        (p, i) =>
          Number.isFinite(p.y) &&
          Number.isFinite(bed.points[i].y) &&
          gap(p, bed.points[i]) <= epsilon &&
          bed.points[i].y < p.y &&
          (w.kind === "lake" ? Math.abs(p.y - points[0].y) <= epsilon : i === 0 || p.y <= points[i - 1].y + epsilon)
      );
    add(
      `water-level-${w.id}`,
      "W03",
      [w.id],
      surface && bed ? levels : undefined,
      "水面与河床覆盖实际河段；湖面恒定，河床低于水面且沿向不升高",
      line?.[0] ?? w.outline[0]
    );
    const receiver = waterById.get(w.to ?? ""),
      relation = data.relations.find((r) => r.kind === "flows" && r.owners[0] === w.id && r.owners[1] === w.to);
    const ports = relation?.ports.map((id) => data.ports.find((p) => p.id === id)) ?? [];
    const end = w.kind === "lake" ? receiver?.centerline?.[0] : line?.[line.length - 1];
    const port = ports.find((p) => p && end && gap(p.position, end) <= epsilon);
    const connected =
      !!end &&
      !!relation &&
      ports.length > 0 &&
      ports.every(Boolean) &&
      !!port &&
      port.width > 0 &&
      inRing(end, w.outline) &&
      query.boundaryDistance(end, w.outline) > epsilon &&
      (w.to === "ocean"
        ? ![plan.land, ...plan.islands].some((r) => inRing(end, r))
        : !!receiver && inRing(end, receiver.outline) && query.boundaryDistance(end, receiver.outline) > epsilon) &&
      (w.kind === "lake"
        ? port.ownerId === w.id
        : w.to === "ocean"
          ? port.ownerId === w.id
          : port.ownerId === receiver?.id);
    add(`flow-${w.id}`, "W01", [w.id, w.to ?? ""], connected, "流向对应真实共享端口，连接双方水域且具有非零宽度", end);
    if (connected) connectedPairs.add([w.id, w.to!].sort().join("|"));
    const receivingProfile = w.to === "ocean" ? undefined : profile(w.to ?? "");
    const endpointLevel = surface && end ? levelAt(surface, end) : NaN,
      targetLevel = w.to === "ocean" ? 0 : receivingProfile && end ? levelAt(receivingProfile, end) : NaN;
    add(
      `water-join-level-${w.id}`,
      "W03",
      [w.id, w.to ?? ""],
      surface && (w.to === "ocean" || receivingProfile)
        ? !!port &&
            Number.isFinite(targetLevel) &&
            Math.abs(endpointLevel - targetLevel) <= epsilon &&
            Math.abs(port.height - targetLevel) <= epsilon
        : undefined,
      "共享端口与上游、接收河湖或海平面水位一致",
      end
    );
    if (w.kind === "river") {
      const start = line?.[0],
        source = waterById.get(w.from ?? ""),
        sourcePort = data.ports.find((p) => p.id === w.from && p.ownerId === w.id && p.kind === "water");
      const sourceValid =
        !!start &&
        ((!!source && source.kind === "lake" && source.to === w.id && inRing(start, source.outline)) ||
          (!!sourcePort &&
            gap(start, sourcePort.position) <= epsilon &&
            !!surface &&
            Math.abs(sourcePort.height - points[0].y) <= epsilon &&
            inRing(start, plan.land)));
      add(
        `water-source-${w.id}`,
        "W02",
        [w.id, w.from ?? ""],
        sourceValid,
        "源头来自连接湖口或明确的内陆源端口",
        start
      );
    }
    const bank = plan.slopes.find((s) => s.id === `bank-${w.id}`),
      reservation = data.reservations.find((r) => r.kind === "bank" && r.ownerId === w.id);
    const finiteBounds = (ring: PlanPoint[]) =>
      ring.length >= 3 &&
      ring.every(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.z) &&
          p.x >= 0 &&
          p.z >= 0 &&
          p.x <= plan.parameters.width &&
          p.z <= plan.parameters.depth
      );
    const matching = (a: PlanPoint[], b: PlanPoint[]) =>
      a.length === b.length && a.every((p, i) => gap(p, b[i]) <= epsilon);
    add(
      `water-bank-${w.id}`,
      "W03",
      [w.id],
      !!bank &&
        !!reservation &&
        bank.width > 0 &&
        finiteBounds(bank.outer) &&
        finiteBounds(bank.inner) &&
        matching(bank.inner, w.outline) &&
        matching(reservation.outline, bank.outer),
      "岸带内边界来自真实水域，外边界与预留一致且未越界",
      w.outline[0]
    );
  }
  for (let i = 0; i < plan.waters.length; i++)
    for (let j = i + 1; j < plan.waters.length; j++) {
      const a = plan.waters[i],
        b = plan.waters[j];
      if (!query.overlap(a.outline, b.outline)) continue;
      let allowed = connectedPairs.has([a.id, b.id].sort().join("|"));
      if (allowed && a.kind === "river" && b.kind === "river") {
        const branch = a.to === b.id ? a : b,
          receiver = branch === a ? b : a,
          node = branch.centerline?.[branch.centerline.length - 1];
        const branchWidth = profile(branch.id)?.width,
          receiverWidth = profile(receiver.id)?.width;
        // A connection permits overlap near that node only, never throughout the two whole rivers.
        const radius = 2 * ((branchWidth ?? 0) + (receiverWidth ?? 0));
        allowed =
          !!node &&
          radius > 0 &&
          !intersectsOutsideNode(a.outline, b.outline, node, radius, query) &&
          !intersectsOutsideNode(b.outline, a.outline, node, radius, query);
      }
      add(
        `water-overlap-${a.id}-${b.id}`,
        "W01",
        [a.id, b.id],
        allowed,
        "相交水域有已验证端口；河段相交限于汇流节点范围",
        a.outline[0]
      );
    }
  const visiting = new Set<string>(),
    done = new Set<string>();
  const acyclic = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (done.has(id)) return true;
    visiting.add(id);
    const to = waterById.get(id)?.to;
    if (to && waterById.has(to) && !acyclic(to)) return false;
    visiting.delete(id);
    done.add(id);
    return true;
  };
  add(
    "water-directed-graph",
    "W01",
    plan.waters.map((w) => w.id),
    plan.waters.every((w) => acyclic(w.id)),
    "水流方向图不存在环路"
  );
  return checks;
}
