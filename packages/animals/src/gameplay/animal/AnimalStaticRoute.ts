/** Horizontal world-space position in metres. */
export type AnimalRoutePoint = readonly [number, number];

/** A stable static obstacle and footprint-expanded candidate bypass points. */
export interface AnimalRouteObstacle {
  key: string | number;
  corners: readonly AnimalRoutePoint[];
}

/** Static habitat queries captured for one animal's dimensions and movement medium. */
export interface AnimalRouteQuery {
  /**
   * Check the whole swept footprint, including support and world limits.
   * @param from Segment start in metres.
   * @param to Segment end in metres.
   * @param clearance Extra static-solid corridor width for intermediate legs; support retains the body footprint.
   * @returns Whether this connection is traversable.
   */
  canTraverse(from: AnimalRoutePoint, to: AnimalRoutePoint, clearance?: number): boolean;
  /**
   * Identify the first blocking solid and propose exterior bypass points.
   * @param from Segment start in metres.
   * @param to Segment end in metres.
   * @param clearance Additional corner space for the motion solver, beyond the body footprint.
   * @returns A stable obstacle, or undefined for an unsupported connection with no bypass geometry.
   */
  obstruction(from: AnimalRoutePoint, to: AnimalRoutePoint, clearance: number): AnimalRouteObstacle | undefined;
}

/**
 * Find a bounded static route, testing direct travel before introducing obstacle waypoints.
 * Planning runs when movement intent changes; returned points are persistent and exclude the start.
 * @param from Initial position in metres.
 * @param target Final resting position in metres.
 * @param query Host geometry and habitat queries for the animal footprint.
 * @param cornerClearance Extra space around bypass corners; it does not enlarge the final resting footprint.
 * @returns Checked waypoints ending at target, or undefined when no route is found within the local search budget.
 */
export function planAnimalStaticRoute(
  from: AnimalRoutePoint,
  target: AnimalRoutePoint,
  query: AnimalRouteQuery,
  cornerClearance = 0
): AnimalRoutePoint[] | undefined {
  // Host resolvers may reuse scratch tuples; an accepted route owns its points.
  from = [from[0], from[1]];
  target = [target[0], target[1]];
  if (!query.canTraverse(from, from) || !query.canTraverse(target, target)) return;
  if (query.canTraverse(from, target)) return [target];
  const points: AnimalRoutePoint[] = [from, target];
  const obstacles = new Set<string | number>();
  const edges = new Map<number, number>();
  let checks = 0;
  const addObstacle = (a: AnimalRoutePoint, b: AnimalRoutePoint) => {
    const obstacle = query.obstruction(a, b, cornerClearance);
    if (!obstacle || obstacles.has(obstacle.key) || obstacles.size >= 12) return;
    obstacles.add(obstacle.key);
    for (const point of obstacle.corners) {
      if (points.length >= 50) break;
      if (query.canTraverse(point, point)) points.push([point[0], point[1]]);
    }
  };
  addObstacle(from, target);
  edges.set(1, Infinity);
  // Newly discovered solids can connect nodes that were already visited. Restart
  // the small graph search while retaining all validated connections.
  while (points.length > 2 && checks < 512) {
    const count = points.length;
    const costs = new Array<number>(count).fill(Infinity),
      previous = new Array<number>(count).fill(-1);
    const visited = new Uint8Array(count);
    costs[0] = 0;
    for (let step = 0; step < count; step++) {
      let current = -1,
        best = Infinity;
      for (let i = 0; i < count; i++) {
        const p = points[i];
        const estimate = costs[i] + Math.hypot(p[0] - target[0], p[1] - target[1]);
        if (!visited[i] && estimate < best) {
          best = estimate;
          current = i;
        }
      }
      if (current < 0) break;
      if (current === 1) {
        const route: AnimalRoutePoint[] = [];
        for (let index = 1; index !== 0; index = previous[index]) route.push(points[index]);
        return route.reverse();
      }
      visited[current] = 1;
      for (let next = 0; next < count; next++) {
        if (visited[next] || current === next) continue;
        const key = Math.min(current, next) * 50 + Math.max(current, next);
        let distance = edges.get(key);
        if (distance === undefined) {
          if (++checks > 512) return;
          const a = points[current],
            b = points[next];
          // Intermediate legs need a corridor for the turn into their heading.
          // The terminal leg retains physical landing clearance; its curved
          // approach is validated by the motion solver before acceptance.
          const clearance = current === 1 || next === 1 ? 0 : cornerClearance;
          distance = query.canTraverse(a, b, clearance) ? Math.hypot(b[0] - a[0], b[1] - a[1]) : Infinity;
          edges.set(key, distance);
          if (distance === Infinity) addObstacle(a, b);
        }
        const candidate = costs[current] + distance;
        if (candidate < costs[next]) {
          costs[next] = candidate;
          previous[next] = current;
        }
      }
    }
    if (points.length === count) return;
  }
}

/**
 * Advance intermediate waypoints without stopping or changing the final destination.
 * The same rule must be used for route validation and live movement.
 * @param motion Current world-space horizontal position.
 * @param points Persistent checked route excluding its initial position.
 * @param cursor Current waypoint index.
 * @param passRadius Distance in metres at which a bypass point can be passed.
 * @returns Monotonically advancing index, always retaining the final destination for arrival handling.
 */
export function advanceAnimalRouteTarget(
  motion: { x: number; z: number },
  points: readonly AnimalRoutePoint[],
  cursor: number,
  passRadius: number
): number {
  while (cursor < points.length - 1) {
    const point = points[cursor];
    const dx = motion.x - point[0],
      dz = motion.z - point[1];
    if (dx * dx + dz * dz > passRadius * passRadius) break;
    cursor++;
  }
  return cursor;
}
