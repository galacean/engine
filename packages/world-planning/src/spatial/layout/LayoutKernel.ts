import type { PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import { envelope } from "../../semantic-study/IslandPlanAtoms";
import { overlap } from "../../semantic-study/WorldPlanningGeometry";
import {
  bounds,
  intersects,
  boxOutline,
  boxesOverlap,
  VolumeIndex,
  type Volume,
  type VolumeBox,
  type Bounds
} from "./Volumes";
import {
  layoutRule,
  layoutRandom,
  type LayoutRule,
  type LayoutConstruction,
  type LayoutConnectionPlan
} from "./LayoutRules";
import { compileRoadPath, ROAD_GEOMETRY_VERSION } from "./RoadGeometry";
import { volumeGap } from "./VolumeSpacing";
import { volumeGroundSlope, boxGroundBottom } from "./VolumeTerrain";
export type { LayoutRule } from "./LayoutRules";
export { bounds, intersects } from "./Volumes";

/** One group's resolved spatial output, independent of renderer/asset names. */
export interface LayoutGroup {
  id: string;
  center: PlanPoint;
  rule: LayoutRule;
  volumes: Volume[];
  construction?: LayoutConstruction;
  paths: (Pick<PlanRoute, "id" | "from" | "to" | "points" | "width"> &
    Partial<Pick<PlanRoute, "widths" | "keypoints">> & { backbone?: boolean })[];
  ports: LayoutConnectionPlan["ports"];
  attempts: number;
  inputSignature: string;
  overrides?: Record<string, VolumeEdit>;
  shapeSignature?: string;
  spacingVersion?: number;
  connectionSignature?: string;
  /** All obstacle queries, including rejected routes, used by the cached connection solve. */
  connectionBounds?: Bounds;
}
/** Instance-level overrides; coordinates are absolute and dimensions set its primary frame and scale every part. */
export interface VolumeEdit {
  x?: number;
  z?: number;
  width?: number;
  depth?: number;
  height?: number;
  yawDegrees?: number;
  maxGroundSlopeDegrees?: number;
}
/** @returns The world-aligned envelope used for parameter handles, never for narrow-phase collisions. */
export function volumeEnvelope(volume: Volume) {
  const b = bounds(volume.boxes.flatMap(boxOutline));
  return {
    center: { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 },
    width: b.x1 - b.x0,
    depth: b.z1 - b.z0,
    height:
      Math.max(...volume.boxes.map((b) => b.elevation + b.height)) - Math.min(...volume.boxes.map((b) => b.elevation))
  };
}
function transform(volume: Volume, from: PlanPoint, to: PlanPoint, edit: VolumeEdit): Volume {
  if (from.x === to.x && from.z === to.z && !Object.values(edit).some((v) => v !== undefined)) return volume;
  const primary = volume.boxes[0],
    yaw = (edit.yawDegrees === undefined ? primary.yaw : (edit.yawDegrees * Math.PI) / 180) - primary.yaw;
  const sx = edit.width === undefined ? 1 : edit.width / primary.width,
    sz = edit.depth === undefined ? 1 : edit.depth / primary.depth;
  const sy = edit.height === undefined ? 1 : edit.height / primary.height,
    c = Math.cos(yaw),
    s = Math.sin(yaw);
  const center = { x: edit.x ?? to.x, z: edit.z ?? to.z };
  return {
    ...volume,
    boxes: volume.boxes.map((b) => {
      const x = (b.center.x - from.x) * sx,
        z = (b.center.z - from.z) * sz;
      return {
        ...b,
        center: { x: center.x + x * c - z * s, z: center.z + x * s + z * c },
        width: b === primary && edit.width !== undefined ? edit.width : b.width * sx,
        depth: b === primary && edit.depth !== undefined ? edit.depth : b.depth * sz,
        height: b === primary && edit.height !== undefined ? edit.height : b.height * sy,
        yaw: b.yaw + yaw
      };
    })
  };
}
/** Apply authored geometry after generation. No placement query or exclusion index
 * participates, so an overlap never moves this body or changes another candidate. */
export function applyLayoutGroupEdits(
  group: LayoutGroup,
  overrides: Record<string, VolumeEdit>,
  ground: (p: PlanPoint) => number
): LayoutGroup {
  for (const edit of Object.values(overrides))
    for (const [key, value] of Object.entries(edit)) {
      if (value === undefined) continue;
      if (!Number.isFinite(value) || (["width", "depth", "height"].includes(key) && value <= 0))
        throw new Error("单体编辑需要有限坐标及正尺寸");
    }
  return {
    ...group,
    volumes: group.volumes.map((volume) => {
      const edit = overrides[volume.id];
      if (!edit || !Object.values(edit).some((value) => value !== undefined)) return volume;
      const changed = transform(volume, volume.boxes[0].center, volume.boxes[0].center, edit);
      return { ...changed, boxes: changed.boxes.map((box) => ({ ...box, elevation: boxGroundBottom(box, ground) })) };
    }),
    attempts: 0,
    overrides: structuredClone(overrides)
  };
}
/** Construct the unedited POI population once, then apply explicit instance edits.
 * Author overrides never enter the candidate exclusion/spacing index. */
export function solveLayoutGroup(
  id: string,
  center: PlanPoint,
  rule: LayoutRule,
  seed: number,
  collision: VolumeIndex,
  inside: (outline: PlanPoint[]) => boolean,
  ground: (p: PlanPoint) => number,
  previous?: LayoutGroup,
  overrides: Record<string, VolumeEdit> = {},
  inputSignature = "",
  components: Record<string, Record<string, unknown>> = {},
  clearFootprint: (outline: PlanPoint[]) => boolean = () => true,
  candidateBounds?: Bounds,
  construction?: LayoutConstruction
): LayoutGroup {
  if (previous && Object.keys(overrides).length)
    return applyLayoutGroupEdits({ ...previous, rule, inputSignature }, overrides, ground);
  const plugin = layoutRule(rule.pattern);
  construction ??= plugin.build({
    owner: id,
    center: { ...center },
    parameters: Object.freeze({ ...rule }),
    components: structuredClone(components),
    region: candidateBounds
      ? [
          { x: candidateBounds.x0, z: candidateBounds.z0 },
          { x: candidateBounds.x1, z: candidateBounds.z0 },
          { x: candidateBounds.x1, z: candidateBounds.z1 },
          { x: candidateBounds.x0, z: candidateBounds.z1 }
        ]
      : envelope(center, rule.radiusM * 2, rule.radiusM * 2, 0),
    random: layoutRandom(seed, id, 0, 0, rule.variationSeed)
  });
  center = construction.center ?? center;
  const retained = new Map(previous?.volumes.map((v) => [v.id, v]));
  for (const v of retained.values()) collision.set(v);
  const volumes: Volume[] = [],
    spacingIndex = new VolumeIndex();
  let attempts = 0;
  const gap = rule.spacingMinM ?? rule.spacingM ?? 0;
  const curved = rule.pattern === "connected" && rule.branchShape === "curve";
  const groundVolume = (v: Volume): Volume => ({
    ...v,
    boxes: v.boxes.map((b) => ({ ...b, elevation: boxGroundBottom(b, ground) }))
  });
  for (const [i, boxes] of construction.members.entries()) {
    const vid = `${id}:volume:${i}`,
      old = retained.get(vid);
    const slope = rule.maxGroundSlopeDegrees ?? 90;
    const supported = (v: Volume) => slope >= 90 || volumeGroundSlope(v, ground, slope + 1e-6) <= slope + 1e-6;
    const clear = (v: Volume) => v.boxes.every((b) => clearFootprint(boxOutline(b)));
    collision.remove(vid);
    attempts++;
    let candidate: Volume = old ?? { id: vid, owner: id, boxes };
    const geometricallyValid =
      clear(candidate) && (old || candidate.boxes.every((b) => inside(boxOutline(b)))) && supported(candidate);
    let placed: Volume | undefined;
    if (geometricallyValid) {
      candidate = groundVolume(candidate);
      // Curve rows enforce signed projected edge gaps during construction. Radial rows use exact footprints here.
      const separated =
        old ||
        curved ||
        gap < 0 ||
        spacingIndex
          .nearby(candidate, gap)
          .every(
            (v) =>
              !v.boxes.some((a) =>
                candidate.boxes.some((b) =>
                  boxesOverlap({ ...a, elevation: 0, height: 1 }, { ...b, elevation: 0, height: 1 })
                )
              ) && volumeGap(v, candidate) + 1e-5 >= gap
          );
      if (separated && !collision.conflicts(candidate).length) placed = candidate;
    }
    if (placed) {
      volumes.push(placed);
      collision.set(placed);
      spacingIndex.set(placed);
    }
  }
  const result: LayoutGroup = {
    id,
    center,
    rule,
    volumes,
    construction,
    paths: [],
    ports: [],
    attempts,
    inputSignature,
    shapeSignature: JSON.stringify([plugin.version, components]),
    spacingVersion: 4,
    overrides: {}
  };
  return Object.keys(overrides).length ? applyLayoutGroupEdits(result, overrides, ground) : result;
}
/** Road-only footprint index. Avoidance here never becomes a volume-placement exclusion relation. */
export class RoadObstacleIndex {
  private items: { outline: PlanPoint[]; box: Bounds }[] = [];
  private bins = new Map<string, number[]>();
  private observe?: (box: Bounds) => void;
  /** Index final OBB footprints independently, preserving all empty space between them. */
  constructor(volumes: readonly Volume[]) {
    this.items = volumes.flatMap((v) =>
      v.boxes.map((box) => {
        const outline = boxOutline(box);
        return { outline, box: bounds(outline) };
      })
    );
    this.items.forEach((item, i) => {
      for (let x = Math.floor(item.box.x0 / 32); x <= Math.floor(item.box.x1 / 32); x++)
        for (let z = Math.floor(item.box.z0 / 32); z <= Math.floor(item.box.z1 / 32); z++) {
          const key = x + ":" + z;
          const bin = this.bins.get(key) ?? [];
          bin.push(i);
          this.bins.set(key, bin);
        }
    });
  }
  /** Capture the spatial read set of a connection solve, including failed searches.
   * Changes outside it cannot alter the result; removals inside it must invalidate it too.
   */
  trackQueries<T>(solve: () => T): { value: T; bounds?: Bounds } {
    let queried: Bounds | undefined;
    const previous = this.observe;
    this.observe = (box) => {
      previous?.(box);
      queried = queried
        ? {
            x0: Math.min(queried.x0, box.x0),
            z0: Math.min(queried.z0, box.z0),
            x1: Math.max(queried.x1, box.x1),
            z1: Math.max(queried.z1, box.z1)
          }
        : { ...box };
    };
    try {
      return { value: solve(), bounds: queried };
    } finally {
      this.observe = previous;
    }
  }
  /** @returns Whether a proposed ground-road footprint overlaps an occupied footprint. */
  collides(outline: PlanPoint[]): boolean {
    const box = bounds(outline);
    this.observe?.(box);
    const seen = new Set<number>();
    for (let x = Math.floor(box.x0 / 32); x <= Math.floor(box.x1 / 32); x++)
      for (let z = Math.floor(box.z0 / 32); z <= Math.floor(box.z1 / 32); z++)
        for (const i of this.bins.get(x + ":" + z) ?? []) {
          if (seen.has(i)) continue;
          seen.add(i);
          const item = this.items[i];
          if (intersects(box, item.box) && overlap(outline, item.outline)) return true;
        }
    return false;
  }
}
/** Resolve access points and internal paths after all groups have published their volumes. */
export function layoutConnectionSignature(id: string, widths: Record<string, number>, accessWidth?: number) {
  return JSON.stringify([
    ROAD_GEOMETRY_VERSION,
    accessWidth,
    Object.entries(widths).filter(([key]) => key.startsWith(id + ":"))
  ]);
}
export function connectLayoutGroup(
  group: LayoutGroup,
  seed: number,
  obstacles: RoadObstacleIndex,
  inside: (outline: PlanPoint[]) => boolean,
  widths: Record<string, number> = {},
  accessWidth = group.rule.pathWidthM,
  entranceInside: (outline: PlanPoint[]) => boolean = inside
): LayoutGroup {
  const { rule, center, id } = group,
    ports: LayoutGroup["ports"] = [],
    paths: LayoutGroup["paths"] = [];
  const random = layoutRandom(seed, id, 0, 0, rule.variationSeed);
  const connectionSignature = layoutConnectionSignature(id, widths, accessWidth);
  const route = (
    from: LayoutGroup["ports"][number],
    to: LayoutGroup["ports"][number],
    pathId: string,
    width: number,
    preferred?: PlanPoint[]
  ) => {
    for (const scale of [1, 0.75, 0.5, 0.25]) {
      const actualWidth = width * scale;
      const compile = (points: PlanPoint[] | undefined) =>
        points &&
        compileRoadPath(
          { id: pathId, from: from.id, to: to.id, width: actualWidth },
          points,
          (_, outline) => inside(outline) && !obstacles.collides(outline)
        );
      const shaped = preferred && compile(preferred);
      if (shaped) return shaped;
      const road = compile(findLocalPath(from.position, to.position, actualWidth, obstacles, inside, rule.radiusM));
      if (road) return road;
    }
    return undefined;
  };
  const plugin = layoutRule(rule.pattern);
  const internalRoads = rule.roadMode !== "none" && (plugin.connections === "tree" || !!plugin.connect);
  if (internalRoads && plugin.connect) {
    let construction = group.construction ?? { members: group.volumes.map((v) => v.boxes) };
    if (construction.spine?.length) {
      // Region boundaries can coincide with water or occupied ground. Move only the
      // two road access endpoints inward along the existing spline, never the OBBs.
      // The POI polygon can include a bay or river. Internal paths use its longest
      // contiguous dry run; the global road stage owns crossings between dry runs.
      let spine: PlanPoint[] = [],
        run: PlanPoint[] = [];
      for (const point of construction.spine) {
        if (entranceInside(envelope(point, rule.pathWidthM / 4, rule.pathWidthM / 4, 0))) run.push(point);
        else {
          if (run.length > spine.length) spine = run;
          run = [];
        }
      }
      if (run.length > spine.length) spine = run;
      const available = (p: PlanPoint) => !obstacles.collides(envelope(p, rule.pathWidthM / 4, rule.pathWidthM / 4, 0));
      const first = spine.findIndex(available);
      let last = spine.length - 1;
      while (last >= 0 && last >= first && !available(spine[last])) last--;
      construction = { ...construction, spine: first >= 0 ? spine.slice(first, last + 1) : [] };
    }
    const topology = plugin.connect({
      owner: id,
      center: { ...center },
      parameters: { ...rule },
      volumes: structuredClone(group.volumes),
      construction,
      random
    });
    if (topology) {
      const ids = new Set(topology.ports.map((p) => p.id));
      if (
        ids.size !== topology.ports.length ||
        topology.ports.some((p) => ![p.position.x, p.position.z].every(Number.isFinite)) ||
        topology.links.some((l) => !ids.has(l.from) || !ids.has(l.to) || !Number.isFinite(l.width) || l.width <= 0)
      )
        throw Error("空间规则连接数据无效");
      for (const link of topology.links) {
        const from = topology.ports.find((p) => p.id === link.from)!,
          to = topology.ports.find((p) => p.id === link.to)!;
        const width = widths[link.id] ?? link.width;
        const road = route(from, to, link.id, width, link.points);
        if (road)
          paths.push({
            ...link,
            points: road.points,
            widths: road.widths,
            keypoints: road.keypoints,
            width: road.width
          });
      }
      return {
        ...group,
        ports: structuredClone(topology.ports).map((p) => ({ ...p, access: p.access })),
        paths,
        connectionSignature
      };
    }
  }
  for (let i = 0; internalRoads && i < 6; i++) {
    const angle = random("ports") * Math.PI * 2 + ((i % 3) * Math.PI * 2) / 3 + (i >= 3 ? Math.PI / 3 : 0);
    const position = { x: center.x + Math.cos(angle) * rule.radiusM, z: center.z + Math.sin(angle) * rule.radiusM };
    const outline = envelope(position, rule.pathWidthM, rule.pathWidthM, 0);
    if (entranceInside(outline) && !obstacles.collides(outline))
      ports.push({ id: `${id}:port:${i}`, position, access: true });
  }
  if (!internalRoads) {
    // Approach actual content instead of an arbitrary empty point on the sampling radius.
    for (const volume of group.volumes)
      for (const box of volume.boxes) {
        for (let i = 0; i < 4 && ports.length < 6; i++) {
          const yaw = box.yaw + (i * Math.PI) / 2;
          const radius = (i % 2 ? box.depth : box.width) / 2 + Math.max(rule.pathWidthM, accessWidth) + 2;
          const position = { x: box.center.x + Math.cos(yaw) * radius, z: box.center.z + Math.sin(yaw) * radius };
          const outline = envelope(position, rule.pathWidthM, rule.pathWidthM, yaw);
          if (entranceInside(outline) && !obstacles.collides(outline))
            ports.push({ id: `${id}:port:${ports.length}`, position, access: true });
        }
      }
  }
  if (internalRoads) {
    const alternatives = new Map<string, PlanPoint[]>();
    for (const volume of group.volumes) {
      const box = volume.boxes[0];
      // Build the free-space skeleton independently of whether content spurs are requested.
      // Member entrances are attached only after this backbone has been connected.
      for (const member of rule.roadMode === "backbone" ? [false] : [false, true]) {
        const portId = member ? `${volume.id}:port` : `${id}:guide:${volume.id.split(":").at(-1)}:port`;
        for (let i = 0; i < 4; i++) {
          const yaw = box.yaw + (i * Math.PI) / 2;
          const radius =
            (i % 2 ? box.depth : box.width) / 2 +
            Math.max(rule.pathWidthM, accessWidth) / 2 +
            1 +
            (member ? 0 : rule.pathWidthM * 2);
          const position = { x: box.center.x + Math.cos(yaw) * radius, z: box.center.z + Math.sin(yaw) * radius };
          const outline = envelope(position, rule.pathWidthM, rule.pathWidthM, yaw);
          if (entranceInside(outline) && !obstacles.collides(outline)) {
            const choices = alternatives.get(portId);
            if (choices) choices.push(position);
            else {
              ports.push({
                id: portId,
                position,
                access: false,
                // Branch layouts serve each member's surrounding space. A clearing
                // layout instead serves its center; its guides remain route candidates.
                ...(!member && !plugin.centerClearing ? { servesVolumeId: volume.id } : {})
              });
              alternatives.set(portId, []);
            }
          }
        }
      }
    }
    if (
      layoutRule(rule.pattern).centerClearing &&
      rule.openRadiusM > 0 &&
      entranceInside(envelope(center, rule.pathWidthM, rule.pathWidthM, 0)) &&
      !obstacles.collides(envelope(center, rule.pathWidthM, rule.pathWidthM, 0))
    )
      ports.push({ id: `${id}:center:port`, position: { ...center }, access: false });
    const root =
      ports.find((p) => p.id === `${id}:center:port`) ??
      ports.find((p) => p.id.endsWith(":port")) ??
      ports.find((p) => p.access);
    const connected = root ? [root] : [];
    if (root) {
      const memberIds = new Set(group.volumes.map((v) => v.id + ":port"));
      const phases = [false, true].map((members) => ports.filter((p) => p !== root && memberIds.has(p.id) === members));
      for (const remaining of phases) {
        while (remaining.length) {
          let nearest: {
            i: number;
            from: (typeof ports)[number];
            distance: number;
            branch?: { path: number; segment: number };
          } = { i: -1, from: connected[0], distance: Infinity };
          const consider = (i: number, from: (typeof ports)[number], branch?: { path: number; segment: number }) => {
            const to = remaining[i],
              distance = Math.hypot(to.position.x - from.position.x, to.position.z - from.position.z);
            if (distance < nearest.distance) nearest = { i, from, distance, branch };
          };
          remaining.forEach((node, i) => {
            for (const from of connected) consider(i, from);
            paths.forEach((path, pathIndex) => {
              for (let segment = 1; segment < path.points.length; segment++) {
                const a = path.points[segment - 1],
                  b = path.points[segment],
                  dx = b.x - a.x,
                  dz = b.z - a.z,
                  length = dx * dx + dz * dz;
                if (length < 1e-8) continue;
                const t = Math.max(
                  0,
                  Math.min(1, ((node.position.x - a.x) * dx + (node.position.z - a.z) * dz) / length)
                );
                const position = { x: a.x + dx * t, z: a.z + dz * t };
                if (
                  [path.points[0], path.points.at(-1)!].some(
                    (p) => Math.hypot(p.x - position.x, p.z - position.z) < path.width * 2
                  )
                )
                  continue;
                consider(
                  i,
                  { id: `${id}:junction:${node.id}:${pathIndex}`, position, access: false },
                  { path: pathIndex, segment }
                );
              }
            });
          });
          if (nearest.i < 0) break;
          const to = remaining[nearest.i];
          const pathId = `${id}:path:${to.id}`,
            width = widths[pathId] ?? rule.pathWidthM;
          const road = route(nearest.from, to, pathId, width);
          if (road) {
            if (nearest.branch) {
              const { path: at, segment } = nearest.branch,
                parent = paths[at],
                point = nearest.from.position;
              paths[at] = {
                ...parent,
                to: nearest.from.id,
                points: [...parent.points.slice(0, segment), point],
                widths: undefined,
                keypoints: undefined
              };
              paths.push({
                ...parent,
                id: parent.id + ":after:" + to.id,
                from: nearest.from.id,
                points: [point, ...parent.points.slice(segment)],
                widths: undefined,
                keypoints: undefined
              });
              ports.push(nearest.from);
              connected.push(nearest.from);
            }
            paths.push({
              id: pathId,
              from: nearest.from.id,
              to: to.id,
              points: road.points,
              widths: road.widths,
              keypoints: road.keypoints,
              width: road.width
            });
            connected.push(to);
            remaining.splice(nearest.i, 1);
          } else {
            // Each entrance face gets one closest-network attempt, not every possible node pair.
            const next = alternatives.get(to.id)?.shift();
            if (next) to.position = next;
            else remaining.splice(nearest.i, 1);
          }
        }
      }
    }
    for (const port of ports) port.access = port.access && connected.includes(port);
    // A coastal or compact group can have no feasible peripheral candidate. Its
    // connected content entrance is still a valid world-network endpoint.
    if (!ports.some((p) => p.access) && root) root.access = true;
  }
  return { ...group, ports, paths, connectionSignature };
}

/** Finite local grid routing around solid footprints. No slope, POI boundary or material-name gates. */
export function findLocalPath(
  a: PlanPoint,
  b: PlanPoint,
  width: number,
  index: RoadObstacleIndex,
  inside: (outline: PlanPoint[]) => boolean,
  margin = 30
): PlanPoint[] | undefined {
  const clear = (p: PlanPoint, q: PlanPoint) => {
    const outline = envelope(
      { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 },
      Math.hypot(q.x - p.x, q.z - p.z) + 0.1,
      width,
      Math.atan2(q.z - p.z, q.x - p.x)
    );
    return inside(outline) && !index.collides(outline);
  };
  if (!clear(a, a) || !clear(b, b)) return undefined;
  if (clear(a, b)) return [a, b];
  const box = bounds([a, b], Math.min(100, margin)),
    step = Math.max(2, width / 2),
    cols = Math.ceil((box.x1 - box.x0) / step) + 1;
  const rows = Math.ceil((box.z1 - box.z0) / step) + 1,
    point = (n: number) => ({ x: box.x0 + (n % cols) * step, z: box.z0 + Math.floor(n / cols) * step });
  const nearest = (p: PlanPoint) => Math.round((p.z - box.z0) / step) * cols + Math.round((p.x - box.x0) / step);
  const start = nearest(a),
    goal = nearest(b),
    costs = new Map([[start, 0]]),
    parents = new Map<number, number>();
  const queue: { id: number; cost: number }[] = [],
    closed = new Set<number>();
  const push = (entry: { id: number; cost: number }) => {
    let i = queue.length;
    queue.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (queue[parent].cost <= entry.cost) break;
      queue[i] = queue[parent];
      i = parent;
    }
    queue[i] = entry;
  };
  const pop = () => {
    const first = queue[0],
      last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1].cost < queue[child].cost) child++;
        if (last.cost <= queue[child].cost) break;
        queue[i] = queue[child];
        i = child;
      }
      queue[i] = last;
    }
    return first;
  };
  push({ id: start, cost: 0 });
  while (queue.length && closed.size < 12000) {
    const at = pop().id;
    if (closed.has(at)) continue;
    closed.add(at);
    if (at === goal) {
      const raw = [b];
      let n = parents.get(at)!;
      while (n !== undefined && n !== start) {
        raw.push(point(n));
        n = parents.get(n)!;
      }
      raw.push(a);
      raw.reverse();
      if (!raw.slice(1).every((p, i) => clear(raw[i], p))) return;
      const simplified = [a];
      let cursor = 0;
      while (cursor < raw.length - 1) {
        let next = raw.length - 1;
        while (next > cursor + 1 && !clear(raw[cursor], raw[next])) next--;
        simplified.push(raw[next]);
        cursor = next;
      }
      return simplified;
    }
    const p = at === start ? a : point(at),
      x = at % cols,
      z = Math.floor(at / cols);
    for (const [dx, dz] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1]
    ]) {
      if (x + dx < 0 || x + dx >= cols || z + dz < 0 || z + dz >= rows) continue;
      const next = at + dz * cols + dx,
        q = next === goal ? b : point(next);
      if (closed.has(next)) continue;
      const cost = costs.get(at)! + Math.hypot(q.x - p.x, q.z - p.z);
      if (cost >= (costs.get(next) ?? Infinity)) continue;
      // A worse arrival cannot enter the queue, so its expensive footprint query
      // cannot affect either the selected route or the search budget.
      if (!clear(p, q)) continue;
      costs.set(next, cost);
      parents.set(next, at);
      push({ id: next, cost: cost + Math.hypot(q.x - b.x, q.z - b.z) });
    }
  }
}
