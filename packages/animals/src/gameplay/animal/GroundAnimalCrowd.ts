import { GroundAnimalRecovery } from "./GroundAnimalRecovery";
import type { AnimalRoutePoint, AnimalRouteQuery } from "./AnimalStaticRoute";
import { advanceGroundAnimalMotion, type GroundAnimalMotion, type AnimalSteeringOptions } from "./GroundAnimalSteering";

/** Asset-independent circular ground footprint and movement intent, in metres. */
export interface GroundAnimalBody {
  readonly motion: GroundAnimalMotion;
  /** Defaults to true. After registration, change activation through crowd.setActive(). */
  active?: boolean;
  /** Independent travel planes, e.g. ground, water and an airborne layer. Defaults to ground. */
  layer?: string;
  /** Optional world-space vertical bounds for spawn, goal and touchdown occupancy. */
  elevation?: number;
  height?: number;
  radius: number;
  bodyLength: number;
  steering?: Readonly<AnimalSteeringOptions>;
  /** Zero means stationary; stationary actors remain collision obstacles. */
  desiredSpeed: number;
  target: readonly [number, number];
  arrived: boolean;
  blocked: boolean;
  /** Neither straight travel nor a forward turning arc is supported. */
  surfaceBlocked?: boolean;
  /** Shared with coarse simulation when this body is streamed out. */
  recovery?: GroundAnimalRecovery;
  /** Optional pose constraint, evaluated even while stopped so traffic can wake a waiting tree. */
  motionFraction?(seconds: number, proposed: Readonly<GroundAnimalMotion>): number;
  /** Reject translation on unsupported ground; rotation stops with rejected travel. */
  canTranslate?(proposed: Readonly<GroundAnimalMotion>, from?: Readonly<GroundAnimalMotion>): boolean;
}
type CrowdQueryBody = Pick<GroundAnimalBody, "radius" | "elevation" | "height" | "layer"> & {
  readonly motion: Pick<GroundAnimalMotion, "x" | "z">;
  readonly steering?: Pick<AnimalSteeringOptions, "arrivalRadius">;
};

interface CrowdQueryState {
  readonly id: number;
  readonly body: CrowdQueryBody;
  readonly reservation?: {
    x: number;
    z: number;
    elevation?: number;
    layer?: string;
    cellKey: number;
    hasElevation?: boolean;
  };
}

interface BodyState extends CrowdQueryState {
  recovery: GroundAnimalRecovery;
  cellKey: number;
  brakeAcceleration: number;
  intentX: number;
  intentZ: number;
  body: GroundAnimalBody;
  next: GroundAnimalMotion;
  forward: GroundAnimalMotion;
  neighbours: BodyState[];
  reservedNeighbours: BodyState[];
  reservation?: { x: number; z: number; elevation?: number; layer?: string; cellKey: number };
  querySnapshot?: CrowdQueryState;
  bodyKey: string;
  reservationKey: string;
  managedQueries: boolean;
  publishedQuery: MutableCrowdBody;
}

interface CrowdSnapshotState {
  readonly grid: Map<number, CrowdQueryState[]>;
  readonly reservations: Map<number, CrowdQueryState[]>;
  readonly maximumRadius: number;
}

/**
 * Shared movement follows planned waypoints with resting-footprint braking and one-step contact checks.
 * Actors commit sequentially: no future traffic prediction, candidate headings or iterative pair solver.
 * Airborne travel is never stopped by crowd contact; goal/landing occupancy remains queryable.
 * Footprints must be non-overlapping at registration. Mesh physics and navigation are host responsibilities.
 */
export class GroundAnimalCrowd {
  private readonly states: BodyState[] = [];
  private readonly byBody = new WeakMap<GroundAnimalBody, BodyState>();
  private readonly activeStates = new Set<BodyState>();
  private readonly grid = new Map<number, BodyState[]>();
  private readonly reservations = new Map<number, BodyState[]>();
  private localPairs = 0;
  private nextId = 0;
  private maximumRadius = 0;
  private readonly cellSize = 4;
  private liveSnapshotState?: CrowdSnapshotState;
  private queryRevision = 0;
  private readonly queryOverrides = { values: new Float64Array(2), layer: undefined as string | undefined };
  private pooledSnapshot?: PooledCrowdSnapshot;
  private readonly snapshotPool: PooledCrowdSnapshot[] = [];
  private readonly freeQueries: GroundAnimalRouteQuery[] = [];
  private readonly untrackedStates: BodyState[] = [];
  private snapshotCaptures = 0;
  private snapshotFallbackChecks = 0;
  private allocatedQueries = 0;
  private neighbourChecks = 0;
  private constrainedSteps = 0;
  private steps = 0;
  private milliseconds = 0;
  private maxMilliseconds = 0;
  private worstClearance = Infinity;

  /**
   * Register a footprint; unsafe spawns are rejected instead of moving other animals.
   * With managedQueries, the owner must publishQueryState after external writes to motion.x/z,
   * radius, elevation, height, layer or steering.arrivalRadius. Crowd mutation methods publish themselves.
   * The default preserves direct-write compatibility by checking untracked bodies on query acquisition.
   */
  add(body: GroundAnimalBody, managedQueries = false): void {
    if (!Number.isFinite(body.radius) || body.radius <= 0 || this.states.some((s) => s.body === body))
      throw new Error("Invalid crowd footprint");
    if (!this.canResize(body, body.radius)) throw new Error("Overlapping crowd spawn");
    this.maximumRadius = Math.max(this.maximumRadius, restingRadius(body));
    const state: BodyState = {
      id: this.nextId++,
      recovery: body.recovery ?? new GroundAnimalRecovery(),
      cellKey: this.key(Math.floor(body.motion.x / this.cellSize), Math.floor(body.motion.z / this.cellSize)),
      brakeAcceleration: Math.max(0.05, body.desiredSpeed / 0.6),
      intentX: body.target[0],
      intentZ: body.target[1],
      body,
      next: { ...body.motion },
      forward: { ...body.motion },
      neighbours: [],
      reservedNeighbours: [],
      bodyKey: `crowd:${this.nextId - 1}:body`,
      reservationKey: `crowd:${this.nextId - 1}:goal`,
      managedQueries,
      publishedQuery: createCrowdBody()
    };
    this.liveSnapshotState = undefined;
    copyCrowdBody(body, state.publishedQuery);
    this.queryRevision++;
    if (!managedQueries) this.untrackedStates.push(state);
    this.states.push(state);
    this.byBody.set(body, state);
    const bucket = this.grid.get(state.cellKey);
    if (bucket) bucket.push(state);
    else this.grid.set(state.cellKey, [state]);
    if (body.active !== false) this.activeStates.add(state);
  }

  /** Remove a disposed actor from movement and collision queries. */
  remove(body: GroundAnimalBody): void {
    const i = this.states.findIndex((s) => s.body === body);
    if (i < 0) return;
    this.liveSnapshotState = undefined;
    const [state] = this.states.splice(i, 1);
    this.queryRevision++;
    if (!state.managedQueries) this.untrackedStates.splice(this.untrackedStates.indexOf(state), 1);
    this.activeStates.delete(state);
    this.release(body);
    this.byBody.delete(body);
    this.removeFromGrid(state);
    if (this.activeStates.size === 0) {
      this.neighbourChecks = 0;
      this.localPairs = 0;
    }
  }

  /** Freeze or wake a registered footprint; frozen bodies reserve their position without simulation. */
  setActive(body: GroundAnimalBody, active: boolean): void {
    const state = this.states.find((s) => s.body === body);
    if (!state || this.activeStates.has(state) === active) return;
    body.active = active;
    if (active) {
      this.activeStates.add(state);
    } else {
      this.activeStates.delete(state);
      state.neighbours.length = state.reservedNeighbours.length = 0;
      body.motion.speed = body.motion.angularSpeed = 0;
      if (this.activeStates.size === 0) {
        this.neighbourChecks = 0;
        this.localPairs = 0;
      }
    }
  }

  /**
   * Publish a coarse-simulated sleeper's new footprint without solving avoidance.
   * @param body Registered inactive body whose motion and elevation were advanced by its host.
   */
  synchronizeDormantPosition(body: GroundAnimalBody): void {
    const state = this.byBody.get(body);
    if (!state || this.activeStates.has(state)) throw new Error("Expected a dormant crowd body");
    this.updateGrid(state);
    state.next.x = body.motion.x;
    state.next.z = body.motion.z;
    state.next.heading = body.motion.heading;
    state.next.speed = body.motion.speed;
    state.next.angularSpeed = body.motion.angularSpeed;
    body.blocked = body.arrived = false;
  }

  /** A new task waypoint releases the previous traffic wait; no other actors' velocities are predicted. */
  publishIntent(body: GroundAnimalBody): void {
    this.publishQueryState(body);
    const state = this.byBody.get(body);
    if (state && (state.intentX !== body.target[0] || state.intentZ !== body.target[1])) {
      state.intentX = body.target[0];
      state.intentZ = body.target[1];
      state.recovery.reset();
      body.blocked = false;
    }
  }

  /** Check a proposed instance scale without introducing penetration or relocating actors. */
  canResize(body: GroundAnimalBody, radius: number): boolean {
    if (!Number.isFinite(radius) || radius <= 0) return false;
    this.maximumRadius = Math.max(this.maximumRadius, restingRadius(body, radius));
    const reservation = this.byBody.get(body)?.reservation;
    const landing = reservation ? { ...body, elevation: reservation.elevation, layer: reservation.layer } : undefined;
    return this.states.every((s) => {
      if (s.body === body) return true;
      const other = s.body,
        target = s.reservation,
        clearance = radius + other.radius + 0.001;
      if (
        sharesHeight(other, body) &&
        Math.hypot(other.motion.x - body.motion.x, other.motion.z - body.motion.z) < clearance
      )
        return false;
      if (
        target &&
        sharesReservationHeight(body, s) &&
        Math.hypot(target.x - body.motion.x, target.z - body.motion.z) < radius + restingRadius(other) + 0.001
      )
        return false;
      if (reservation && landing) {
        if (
          sharesHeight(other, landing) &&
          Math.hypot(other.motion.x - reservation.x, other.motion.z - reservation.z) <
            restingRadius(body, radius) + other.radius + 0.001
        )
          return false;
        if (
          target &&
          sharesReservationHeight(landing, s) &&
          Math.hypot(target.x - reservation.x, target.z - reservation.z) <
            restingRadius(body, radius) + restingRadius(other) + 0.001
        )
          return false;
      }
      return true;
    });
  }

  /** Current footprint occupancy for goals and touchdown; no predicted airborne routes. */
  canOccupy(
    body: GroundAnimalBody,
    x: number,
    z: number,
    elevation = body.elevation,
    layer = body.layer,
    radius = body.radius
  ): boolean {
    const reach = radius + this.maximumRadius + 0.001;
    const proposed = { ...body, elevation, layer };
    for (let ix = Math.floor((x - reach) / this.cellSize); ix <= Math.floor((x + reach) / this.cellSize); ix++)
      for (let iz = Math.floor((z - reach) / this.cellSize); iz <= Math.floor((z + reach) / this.cellSize); iz++)
        for (const other of this.grid.get(this.key(ix, iz)) ?? []) {
          const b = other.body;
          if (
            b !== body &&
            sharesHeight(proposed, b) &&
            Math.hypot(b.motion.x - x, b.motion.z - z) < radius + b.radius + 0.001
          )
            return false;
        }
    return true;
  }

  /** Check current footprints and other actors' accepted resting goals. No moving-route prediction. */
  canReserve(body: GroundAnimalBody, x: number, z: number, elevation = body.elevation, layer = body.layer): boolean {
    const radius = restingRadius(body);
    if (
      !this.byBody.has(body) ||
      ![x, z, elevation ?? 0].every(Number.isFinite) ||
      !this.canOccupy(body, x, z, elevation, layer, radius)
    )
      return false;
    const reach = radius + this.maximumRadius + 0.001;
    const proposed = { ...body, elevation, layer };
    for (let ix = Math.floor((x - reach) / this.cellSize); ix <= Math.floor((x + reach) / this.cellSize); ix++)
      for (let iz = Math.floor((z - reach) / this.cellSize); iz <= Math.floor((z + reach) / this.cellSize); iz++)
        for (const other of this.reservations.get(this.key(ix, iz)) ?? []) {
          const r = other.reservation!,
            b = other.body;
          if (
            b !== body &&
            sharesReservationHeight(proposed, other) &&
            Math.hypot(r.x - x, r.z - z) < radius + restingRadius(b) + 0.001
          )
            return false;
        }
    return true;
  }

  /** Atomically replace a goal reservation. A rejected goal keeps the previous accepted reservation. */
  reserve(body: GroundAnimalBody, x: number, z: number, elevation = body.elevation, layer = body.layer): boolean {
    if (!this.canReserve(body, x, z, elevation, layer)) return false;
    const state = this.byBody.get(body)!;
    this.release(body);
    const cellKey = this.key(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
    this.queryRevision++;
    state.reservation = { x, z, elevation, layer, cellKey };
    const bucket = this.reservations.get(cellKey);
    if (bucket) bucket.push(state);
    else this.reservations.set(cellKey, [state]);
    return true;
  }

  /** Release a cancelled or completed goal. Sleeping actors retain their reservations until explicitly released. */
  release(body: GroundAnimalBody): void {
    const state = this.byBody.get(body),
      r = state?.reservation;
    if (!r) return;
    this.queryRevision++;
    const bucket = this.reservations.get(r.cellKey)!;
    bucket.splice(bucket.indexOf(state!), 1);
    if (!bucket.length) this.reservations.delete(r.cellKey);
    state!.reservation = undefined;
  }

  /** Publish changed query inputs after a managed body's host writes them. No allocation or global scan. */
  publishQueryState(body: GroundAnimalBody): void {
    const state = this.byBody.get(body);
    if (state && crowdBodyChanged(body, state.publishedQuery)) {
      copyCrowdBody(body, state.publishedQuery);
      this.queryRevision++;
    }
  }

  /**
   * Preallocate after membership size is known and before a planning burst.
   * Exceeding the reserved body, query or simultaneously retained snapshot capacity grows the pool.
   */
  reserveRouteQueries(queryCount: number, snapshotCount = queryCount + 1): void {
    while (this.allocatedQueries < queryCount) {
      this.freeQueries.push(new GroundAnimalRouteQuery(this));
      this.allocatedQueries++;
    }
    while (this.snapshotPool.length < snapshotCount) this.snapshotPool.push(new PooledCrowdSnapshot());
    for (let i = 0; i < this.snapshotPool.length; i++)
      this.snapshotPool[i]!.ensureCapacity(Math.max(1, this.states.length));
  }

  /** Acquire an immutable query lease; release it after completion, cancellation or replacement. */
  acquireRouteQuery(body: GroundAnimalBody, elevation?: number, layer = body.layer): GroundAnimalRouteQuery {
    // Plain public bodies retain direct-write compatibility. Native owners publish their writes instead.
    for (let i = 0; i < this.untrackedStates.length; i++) {
      this.snapshotFallbackChecks++;
      this.publishQueryState(this.untrackedStates[i]!.body);
    }
    let snapshot = this.pooledSnapshot;
    if (!snapshot || snapshot.revision !== this.queryRevision) {
      snapshot = undefined;
      for (let i = 0; i < this.snapshotPool.length; i++) {
        if (this.snapshotPool[i]!.references === 0) {
          snapshot = this.snapshotPool[i]!;
          break;
        }
      }
      if (!snapshot) {
        snapshot = new PooledCrowdSnapshot();
        this.snapshotPool.push(snapshot);
      }
      snapshot.capture(this.states, this.queryRevision);
      this.snapshotCaptures++;
      this.pooledSnapshot = snapshot;
    }
    let query = this.freeQueries.pop();
    if (!query) {
      query = new GroundAnimalRouteQuery(this);
      this.allocatedQueries++;
    }
    // reset already copies the body's default elevation; only carry an explicit override.
    this.queryOverrides.values[0] = elevation ?? 0;
    this.queryOverrides.values[1] = elevation !== undefined ? 1 : 0;
    this.queryOverrides.layer = layer;
    query.reset(snapshot, body, this.byBody.get(body)?.id ?? -1, this.queryOverrides);
    return query;
  }

  /** @internal */
  recycleRouteQuery(query: GroundAnimalRouteQuery): void {
    this.freeQueries.push(query);
  }

  getRouteSnapshotDiagnostics() {
    return {
      activeQueries: this.allocatedQueries - this.freeQueries.length,
      captures: this.snapshotCaptures,
      fallbackBodyChecks: this.snapshotFallbackChecks,
      queries: this.allocatedQueries,
      snapshots: this.snapshotPool.length
    };
  }

  /**
   * Capture decision-time route checks against present footprints and reserved resting goals.
   * Movement uses neither this query nor predictions of neighbouring animals' future motion.
   * A currently overlapping actor may leave outward; final resting occupancy still uses canReserve.
   */
  routeQuery(
    body: GroundAnimalBody,
    elevation = body.elevation,
    layer = body.layer,
    snapshot = false
  ): AnimalRouteQuery {
    const subject = { ...body, elevation, layer };
    const subjectId = this.byBody.get(body)?.id ?? -1;
    const origin = snapshot ? { ...body.motion } : body.motion;
    // Capture query values, not host-owned mutable bodies. Unchanged queries share the same index.
    const snap = snapshot ? this.acquireSnapshotState() : undefined;
    const find = (from: AnimalRoutePoint, to: AnimalRoutePoint, clearance = 0) => {
      const grid = snap ? snap.grid : this.grid;
      const reservations = snap ? snap.reservations : this.reservations;
      const padding = subject.radius + Math.max(0, clearance) + 0.001;
      const reach = padding + (snap ? snap.maximumRadius : this.maximumRadius);
      let nearest: CrowdQueryState | undefined,
        reserved = false,
        hitX = 0,
        hitZ = 0,
        hitRadius = 0,
        first = Infinity;
      const test = (state: CrowdQueryState, x: number, z: number, isReserved: boolean) => {
        if (
          state.id === subjectId ||
          state.body === body ||
          !(isReserved ? sharesReservationHeight(subject, state) : sharesHeight(subject, state.body))
        )
          return;
        const radius = padding + (isReserved ? restingRadius(state.body) : state.body.radius);
        const t = circleSegmentEntry(from, to, x, z, radius, origin.x, origin.z);
        if (t < first) {
          first = t;
          nearest = state;
          reserved = isReserved;
          hitX = x;
          hitZ = z;
          hitRadius = radius;
        }
      };
      const dx = to[0] - from[0],
        dz = to[1] - from[1];
      // Sweep row intervals along the corridor, rather than scanning the empty rectangle of a long diagonal.
      for (
        let iz = Math.floor((Math.min(from[1], to[1]) - reach) / this.cellSize);
        iz <= Math.floor((Math.max(from[1], to[1]) + reach) / this.cellSize);
        iz++
      ) {
        let t0 = 0,
          t1 = 1;
        if (dz) {
          const a = (iz * this.cellSize - reach - from[1]) / dz;
          const b = ((iz + 1) * this.cellSize + reach - from[1]) / dz;
          t0 = Math.max(0, Math.min(a, b));
          t1 = Math.min(1, Math.max(a, b));
        }
        if (t0 > t1) continue;
        const ax = from[0] + dx * t0,
          bx = from[0] + dx * t1;
        for (
          let ix = Math.floor((Math.min(ax, bx) - reach) / this.cellSize);
          ix <= Math.floor((Math.max(ax, bx) + reach) / this.cellSize);
          ix++
        ) {
          const key = this.key(ix, iz);
          for (const state of grid.get(key) ?? []) test(state, state.body.motion.x, state.body.motion.z, false);
          for (const state of reservations.get(key) ?? [])
            test(state, state.reservation!.x, state.reservation!.z, true);
        }
      }
      return nearest
        ? { key: `crowd:${nearest.id}:${reserved ? "goal" : "body"}`, x: hitX, z: hitZ, radius: hitRadius }
        : undefined;
    };
    return {
      canTraverse: (from, to, clearance) => !find(from, to, clearance),
      obstruction: (from, to, clearance) => {
        const hit = find(from, to, clearance);
        if (!hit) return;
        const r = hit.radius + 0.001;
        return {
          key: hit.key,
          corners: [
            [hit.x - r, hit.z - r],
            [hit.x - r, hit.z + r],
            [hit.x + r, hit.z - r],
            [hit.x + r, hit.z + r]
          ]
        };
      }
    };
  }

  /** Airborne elevation must keep progressing; the host validates actual landing contact separately. */
  canSetElevation(body: GroundAnimalBody, elevation: number): boolean {
    return body.layer === "air" || this.canOccupy(body, body.motion.x, body.motion.z, elevation);
  }

  /** Atomically relocate a footprint, including sleeping obstacles; reject occupied or invalid destinations. */
  relocate(body: GroundAnimalBody, x: number, z: number, heading: number): boolean {
    const state = this.states.find((s) => s.body === body);
    if (!state || ![x, z, heading].every(Number.isFinite) || !this.canReserve(body, x, z)) return false;
    state.recovery.reset();
    Object.assign(body.motion, { x, z, heading, speed: 0, angularSpeed: 0 });
    state.next.x = body.motion.x;
    state.next.z = body.motion.z;
    state.next.heading = body.motion.heading;
    state.next.speed = body.motion.speed;
    state.next.angularSpeed = body.motion.angularSpeed;
    body.target = [x, z];
    body.desiredSpeed = 0;
    body.arrived = body.blocked = false;
    this.release(body);
    state.neighbours.length = state.reservedNeighbours.length = 0;
    this.updateGrid(state);
    return true;
  }

  /** Integrate one shared simulation substep; callers limit steps to at most 1/60 second. */
  advance(seconds: number): void {
    if (!(seconds > 0) || seconds > 1 / 60 + 1e-8) throw new RangeError("Crowd requires a positive bounded substep");
    if (this.activeStates.size === 0) return;
    const begin = performance.now();
    this.localPairs = this.neighbourChecks = 0;
    // Accepted resizing normally updates this bound; direct active-radius edits remain conservative too.
    for (const s of this.activeStates) {
      this.maximumRadius = Math.max(this.maximumRadius, restingRadius(s.body));
      this.updateGrid(s);
    }
    for (const s of this.activeStates) {
      const b = s.body,
        m = b.motion;
      this.publishIntent(b);
      s.neighbours.length = s.reservedNeighbours.length = 0;
      if (b.layer !== "air") {
        const speed = Math.max(b.desiredSpeed, m.speed);
        const acceleration = Math.max(0.05, b.desiredSpeed > 0 ? b.desiredSpeed / 0.6 : s.brakeAcceleration);
        const reach = b.radius + this.maximumRadius + 0.2 + speed * 0.35 + (speed * speed) / (2 * acceleration);
        for (let x = Math.floor((m.x - reach) / this.cellSize); x <= Math.floor((m.x + reach) / this.cellSize); x++)
          for (let z = Math.floor((m.z - reach) / this.cellSize); z <= Math.floor((m.z + reach) / this.cellSize); z++) {
            const key = this.key(x, z);
            for (const other of this.grid.get(key) ?? []) {
              if (
                other === s ||
                other.body.desiredSpeed > 0 ||
                other.body.layer === "air" ||
                !sharesHeight(other.body, b)
              )
                continue;
              this.neighbourChecks++;
              if (Math.hypot(other.body.motion.x - m.x, other.body.motion.z - m.z) <= reach) s.neighbours.push(other);
            }
            for (const other of this.reservations.get(key) ?? []) {
              if (other === s || !sharesReservationHeight(b, other)) continue;
              const r = other.reservation!;
              this.neighbourChecks++;
              const distance = Math.hypot(r.x - m.x, r.z - m.z);
              // An actor already inside a newly reserved footprint may leave; never trap it there.
              if (distance <= reach && distance >= b.radius + restingRadius(other.body) + 0.001)
                s.reservedNeighbours.push(other);
            }
          }
      }
      this.localPairs += s.neighbours.length + s.reservedNeighbours.length;
      Object.assign(s.next, m);
      // A held pose reduces current speed to zero, but does not create room to walk.
      // Resume against the intended speed and a wider threshold than the stop threshold;
      // otherwise identical geometry alternates idle/walk as braking margin disappears.
      // Check before pose gating so a real opening can wake a waiting animal.
      if (
        b.layer === "air" ||
        b.desiredSpeed <= 0 ||
        (b.blocked && this.speedLimit(s, b.desiredSpeed) > Math.min(0.24, b.desiredSpeed * 0.5))
      )
        b.blocked = false;
      const limit = b.blocked ? 0 : this.speedLimit(s);
      b.arrived = false;
      if (b.desiredSpeed > 0) {
        s.brakeAcceleration = Math.max(0.05, b.desiredSpeed / 0.6);
        b.arrived = advanceGroundAnimalMotion(
          s.next,
          b.target,
          b.desiredSpeed,
          b.bodyLength,
          seconds,
          limit,
          b.steering
        );
      } else {
        s.next.speed = Math.max(0, m.speed - s.brakeAcceleration * seconds);
        s.next.angularSpeed = m.angularSpeed + Math.max(-2.7 * seconds, Math.min(2.7 * seconds, -m.angularSpeed));
        s.next.heading += s.next.angularSpeed * seconds;
        s.next.x += Math.sin(s.next.heading) * s.next.speed * seconds;
        s.next.z += Math.cos(s.next.heading) * s.next.speed * seconds;
      }
      const supported = b.canTranslate?.(s.next) ?? true;
      b.surfaceBlocked = !supported;
      const goalX = b.target[0] - m.x,
        goalZ = b.target[1] - m.z;
      const behind = goalX * Math.sin(m.heading) + goalZ * Math.cos(m.heading) < 0;
      const closeBehind = behind && Math.hypot(goalX, goalZ) < b.bodyLength * 1.5;
      // A new rearward waypoint cannot turn away while forward braking holds travel at zero.
      const turnFromTraffic = behind && limit < Math.min(0.12, b.desiredSpeed * 0.3);
      let recovered = false;
      if (
        b.layer !== "air" &&
        b.desiredSpeed > 0 &&
        !b.arrived &&
        ((!b.blocked && (!supported || (closeBehind && !b.steering?.urgent && !b.steering?.tightTurns))) ||
          s.recovery.recovering ||
          turnFromTraffic)
      ) {
        Object.assign(s.forward, s.next);
        recovered = s.recovery.advance(
          m,
          s.next,
          b.desiredSpeed,
          b.bodyLength,
          seconds,
          (from, to) => (b.canTranslate?.(to, from) ?? true) && this.canOccupy(b, to.x, to.z)
        );
        if (!recovered && supported) Object.assign(s.next, s.forward);
        b.surfaceBlocked = !supported && !recovered;
        if (recovered) b.blocked = false;
      }
      const pose = Math.max(0, Math.min(1, b.motionFraction?.(seconds, s.next) ?? 1));
      const translationAllowed = pose > 0 && !b.surfaceBlocked;
      const dx = translationAllowed ? (s.next.x - m.x) * pose : 0;
      const dz = translationAllowed ? (s.next.z - m.z) * pose : 0;
      if (!translationAllowed) {
        s.next.speed = 0;
        s.next.angularSpeed = 0;
        s.next.heading = m.heading;
      }
      let fraction = 1;
      for (const n of s.neighbours)
        fraction = Math.min(fraction, this.contact(s, n.body.motion.x, n.body.motion.z, n.body.radius, dx, dz));
      for (const n of s.reservedNeighbours) {
        const r = n.reservation!;
        fraction = Math.min(fraction, this.contact(s, r.x, r.z, restingRadius(n.body), dx, dz));
      }
      if (fraction < 1) this.constrainedSteps++;
      m.x += dx * fraction;
      m.z += dz * fraction;
      const turningFraction = dx !== 0 || dz !== 0 ? pose * fraction : 0;
      m.heading += (s.next.heading - m.heading) * turningFraction;
      // A partial terminal animation sample limits displacement, not the endpoint momentum.
      m.angularSpeed = turningFraction > 0 ? s.next.angularSpeed * fraction : 0;
      m.speed = pose > 0 ? s.next.speed * fraction : 0;
      b.arrived &&= translationAllowed && fraction === 1 && pose === 1;
      if (b.arrived) s.recovery.reset();
      if (pose === 1 && !b.blocked && !recovered)
        b.blocked =
          b.desiredSpeed > 0 &&
          m.speed < Math.min(0.12, b.desiredSpeed * 0.3) &&
          (fraction < 0.01 || limit < Math.min(0.12, b.desiredSpeed * 0.3));
      this.updateGrid(s);
      for (const n of s.neighbours)
        this.worstClearance = Math.min(
          this.worstClearance,
          Math.hypot(m.x - n.body.motion.x, m.z - n.body.motion.z) - b.radius - n.body.radius
        );
    }
    // Later moving actors may have crossed an earlier actor's proposed resting place in this substep.
    // Finalize arrivals only after every footprint is current; moving crossings never become overlapping rests.
    for (const s of this.activeStates) {
      const b = s.body;
      if (b.arrived && !this.canOccupy(b, b.motion.x, b.motion.z)) {
        b.arrived = false;
        b.blocked = true;
      }
    }
    this.steps++;
    const cost = performance.now() - begin;
    this.milliseconds = this.milliseconds * 0.95 + cost * 0.05;
    this.maxMilliseconds = Math.max(this.maxMilliseconds, cost);
  }

  /** Cheap counters for the HUD; includes broadphase neighbours only, with no all-pairs audit. */
  get metrics() {
    return {
      bodies: this.states.length,
      activeBodies: this.activeStates.size,
      blocked: this.states.filter((s) => s.body.blocked).length,
      smoothedMilliseconds: this.milliseconds,
      worstClearance: this.worstClearance
    };
  }

  /** On-demand exhaustive audit; kept outside the frame loop so diagnostics do not hide quadratic work. */
  inspect() {
    let minClearance = Infinity,
      overlaps = 0;
    for (let i = 0; i < this.states.length; i++)
      for (let j = i + 1; j < this.states.length; j++) {
        const a = this.states[i].body,
          b = this.states[j].body;
        if (!sharesHeight(a, b)) continue;
        const clearance = Math.hypot(a.motion.x - b.motion.x, a.motion.z - b.motion.z) - a.radius - b.radius;
        minClearance = Math.min(minClearance, clearance);
        if (clearance < -1e-6) overlaps++;
      }
    return {
      bodies: this.states.length,
      activeBodies: this.activeStates.size,
      steps: this.steps,
      neighbourChecks: this.neighbourChecks,
      localPairs: this.localPairs,
      constrainedSteps: this.constrainedSteps,
      blocked: this.states.filter((s) => s.body.blocked).length,
      minClearance,
      worstClearance: this.worstClearance,
      overlaps,
      smoothedMilliseconds: this.milliseconds,
      maxMilliseconds: this.maxMilliseconds
    };
  }

  private acquireSnapshotState(): CrowdSnapshotState {
    // Hosts can update dormant motion, calibration and interaction steering directly.
    // Comparing the query's scalar inputs is necessary even if no crowd method ran.
    // Reuse each unchanged value record and the whole spatial index when possible.
    let changed = !this.liveSnapshotState;
    for (const state of this.states) {
      const body = state.body;
      const old = state.querySnapshot;
      const previous = old?.body;
      const reservation = state.reservation;
      const previousReservation = old?.reservation;
      const arrivalRadius = body.steering?.arrivalRadius ?? 0;
      if (
        !previous ||
        previous.motion.x !== body.motion.x ||
        previous.motion.z !== body.motion.z ||
        previous.radius !== body.radius ||
        previous.elevation !== body.elevation ||
        previous.height !== body.height ||
        previous.layer !== body.layer ||
        previous.steering!.arrivalRadius !== arrivalRadius ||
        (reservation !== undefined) !== (previousReservation !== undefined) ||
        (reservation &&
          previousReservation &&
          (reservation.x !== previousReservation.x ||
            reservation.z !== previousReservation.z ||
            reservation.elevation !== previousReservation.elevation ||
            reservation.layer !== previousReservation.layer))
      ) {
        state.querySnapshot = {
          id: state.id,
          body: {
            motion: { x: body.motion.x, z: body.motion.z },
            radius: body.radius,
            elevation: body.elevation,
            height: body.height,
            layer: body.layer,
            steering: { arrivalRadius }
          },
          reservation: reservation ? { ...reservation } : undefined
        };
        changed = true;
      }
    }
    if (!changed) return this.liveSnapshotState!;
    let maximumRadius = 0;
    const grid = new Map<number, CrowdQueryState[]>();
    const reservations = new Map<number, CrowdQueryState[]>();
    for (const state of this.states) {
      const copy = state.querySnapshot!;
      maximumRadius = Math.max(maximumRadius, restingRadius(copy.body));
      // A snapshot owns both coordinates and their index, even before a host has
      // published a dormant body's new location to the live avoidance grid.
      const key = this.key(
        Math.floor(copy.body.motion.x / this.cellSize),
        Math.floor(copy.body.motion.z / this.cellSize)
      );
      const bucket = grid.get(key);
      if (bucket) bucket.push(copy);
      else grid.set(key, [copy]);
      if (copy.reservation) {
        const key = copy.reservation.cellKey;
        const bucket = reservations.get(key);
        if (bucket) bucket.push(copy);
        else reservations.set(key, [copy]);
      }
    }
    return (this.liveSnapshotState = { grid, reservations, maximumRadius });
  }

  private key(x: number, z: number): number {
    return (x + 32768) * 65536 + z + 32768;
  }

  private removeFromGrid(state: BodyState): void {
    const bucket = this.grid.get(state.cellKey)!;
    bucket.splice(bucket.indexOf(state), 1);
    if (bucket.length === 0) this.grid.delete(state.cellKey);
  }

  private updateGrid(state: BodyState): void {
    this.publishQueryState(state.body);
    const motion = state.body.motion;
    const key = this.key(Math.floor(motion.x / this.cellSize), Math.floor(motion.z / this.cellSize));
    if (key === state.cellKey) return;
    this.removeFromGrid(state);
    state.cellKey = key;
    const bucket = this.grid.get(key);
    if (bucket) bucket.push(state);
    else this.grid.set(key, [state]);
  }

  private speedLimit(s: BodyState, reactionSpeed = s.body.motion.speed): number {
    const b = s.body,
      m = b.motion;
    let speed = b.desiredSpeed;
    const fx = Math.sin(m.heading),
      fz = Math.cos(m.heading);
    const acceleration = Math.max(0.05, b.desiredSpeed / 0.6);
    for (const n of s.neighbours)
      speed = Math.min(
        speed,
        footprintSpeedLimit(
          n.body.motion.x - m.x,
          n.body.motion.z - m.z,
          fx,
          fz,
          b.radius + n.body.radius + 0.15,
          acceleration,
          reactionSpeed
        )
      );
    for (const n of s.reservedNeighbours)
      speed = Math.min(
        speed,
        footprintSpeedLimit(
          n.reservation!.x - m.x,
          n.reservation!.z - m.z,
          fx,
          fz,
          b.radius + restingRadius(n.body) + 0.15,
          acceleration,
          reactionSpeed
        )
      );
    // A validated escape turn can clear a neighbour even when the straight-line
    // braking margin covers the current pose. Allow a slow forward step on that
    // curve; the swept contact test still clips it against bodies and reservations.
    if (b.steering?.urgent && !b.blocked && b.layer !== "air")
      return Math.max(speed, Math.min(0.6, b.desiredSpeed * 0.35));
    return speed;
  }

  private contact(a: BodyState, x: number, z: number, otherRadius: number, moveX: number, moveZ: number): number {
    const px = x - a.body.motion.x,
      pz = z - a.body.motion.z;
    const radius = a.body.radius + otherRadius + 0.001;
    const aa = moveX * moveX + moveZ * moveZ,
      bb = -(px * moveX + pz * moveZ);
    const cc = px * px + pz * pz - radius * radius;
    if (aa < 1e-16 || bb >= 0 || bb * bb - aa * cc <= 0) return 1;
    const t = (-bb - Math.sqrt(bb * bb - aa * cc)) / aa;
    return t >= 1 ? 1 : Math.max(0, t - 1e-6);
  }
}

function sharesHeight(a: CrowdQueryBody, b: CrowdQueryBody, elevation = b.elevation): boolean {
  // Ground footprints still collide across slopes; only airborne layers use vertical separation.
  if (a.layer !== "air" && b.layer !== "air") return true;
  if (a.elevation !== undefined && elevation !== undefined && a.height !== undefined && b.height !== undefined)
    return a.elevation < elevation + b.height && elevation < a.elevation + a.height;
  return (a.layer ?? "ground") === (b.layer ?? "ground");
}
function sharesReservationHeight(body: CrowdQueryBody, state: CrowdQueryState): boolean {
  const reserved = state.reservation!,
    other = state.body;
  if (body.layer !== "air" && reserved.layer !== "air") return true;
  if (
    body.elevation !== undefined &&
    reserved.elevation !== undefined &&
    body.height !== undefined &&
    other.height !== undefined
  )
    return body.elevation < reserved.elevation + other.height && reserved.elevation < body.elevation + body.height;
  return (body.layer ?? "ground") === (reserved.layer ?? "ground");
}

/** Current footprint only: reaction and braking distance, without predicting a neighbour's motion. */
function footprintSpeedLimit(
  px: number,
  pz: number,
  fx: number,
  fz: number,
  radius: number,
  acceleration: number,
  speed: number
): number {
  const along = px * fx + pz * fz,
    side = Math.abs(px * fz - pz * fx);
  if (along <= 0 || side >= radius) return Infinity;
  const gap = Math.max(0, along - Math.sqrt(radius * radius - side * side));
  return Math.max(0, Math.sqrt(2 * acceleration * gap) - speed * 0.35);
}

/** First circle entry along the current segment, with a one-way escape from an existing overlap. */
function circleSegmentEntry(
  from: AnimalRoutePoint,
  to: AnimalRoutePoint,
  x: number,
  z: number,
  radius: number,
  actorX: number,
  actorZ: number
): number {
  const px = from[0] - x,
    pz = from[1] - z,
    dx = to[0] - from[0],
    dz = to[1] - from[1];
  const lengthSquared = dx * dx + dz * dz,
    dot = px * dx + pz * dz;
  const c = px * px + pz * pz - radius * radius;
  if (c <= 0) {
    const currentStart = Math.hypot(from[0] - actorX, from[1] - actorZ) < 1e-8;
    const initialDistanceSquared = (actorX - x) ** 2 + (actorZ - z) ** 2;
    // Curve validation uses small segments: allow an existing overlap to shrink
    // across several outward steps, while goal admission still forbids resting here.
    if (
      (currentStart && !lengthSquared) ||
      (initialDistanceSquared <= radius * radius && px * px + pz * pz >= initialDistanceSquared - 1e-8 && dot >= 0)
    )
      return Infinity;
    return 0;
  }
  if (!lengthSquared || dot >= 0) return Infinity;
  const discriminant = dot * dot - lengthSquared * c;
  if (discriminant < 0) return Infinity;
  const t = (-dot - Math.sqrt(discriminant)) / lengthSquared;
  return t <= 1 ? Math.max(0, t) : Infinity;
}

/** Reserve every supported stopping position inside the arrival disk, not just its centre. */
function restingRadius(body: Pick<CrowdQueryBody, "radius" | "steering">, radius = body.radius): number {
  return radius + (body.steering?.arrivalRadius ?? 0);
}

/** Reusable storage for a leased decision-time snapshot. Never rewritten while a query retains it. */
class PooledCrowdSnapshot {
  revision = -1;
  references = 0;
  readonly maximumRadius = new Float64Array(1);
  readonly records: MutableCrowdRecord[] = [];
  private heads = new Int32Array(0);
  private reserveHeads = new Int32Array(0);
  private keys = new Float64Array(0);
  private reserveKeys = new Float64Array(0);
  private next = new Int32Array(0);
  private reserveNext = new Int32Array(0);
  private mask = 0;

  ensureCapacity(count: number): void {
    if (this.records.length >= count) return;
    let capacity = Math.max(16, this.records.length);
    while (capacity < count) capacity *= 2;
    while (this.records.length < capacity) this.records.push(createCrowdRecord());
    this.heads = new Int32Array(capacity * 4);
    this.reserveHeads = new Int32Array(capacity * 4);
    this.keys = new Float64Array(capacity * 4);
    this.reserveKeys = new Float64Array(capacity * 4);
    this.next = new Int32Array(capacity);
    this.reserveNext = new Int32Array(capacity);
    this.mask = this.heads.length - 1;
  }

  capture(states: readonly BodyState[], revision: number): void {
    this.ensureCapacity(Math.max(1, states.length));
    this.heads.fill(-1);
    this.reserveHeads.fill(-1);
    let maximumRadius = 0;
    for (let i = 0; i < states.length; i++) {
      const state = states[i]!,
        record = this.records[i]!;
      copyCrowdBody(state.body, record.body);
      record.id = state.id;
      record.bodyKey = state.bodyKey;
      record.reservationKey = state.reservationKey;
      const r = state.reservation,
        values = record.body.values;
      if (r) {
        values[7] = r.x;
        values[8] = r.z;
        values[9] = r.elevation ?? 0;
        values[10] = r.elevation !== undefined ? 1 : 0;
        record.reservedLayer = r.layer;
        this.insert(Math.floor(r.x / 4), Math.floor(r.z / 4), i, true);
      }
      const radius = values[2]! + values[5]!;
      if (radius > maximumRadius) maximumRadius = radius;
      this.insert(Math.floor(values[0]! / 4), Math.floor(values[1]! / 4), i, false);
    }
    this.maximumRadius[0] = maximumRadius;
    this.revision = revision;
  }

  first(x: number, z: number, reserved: boolean): number {
    const key = crowdCellKey(x, z);
    const heads = reserved ? this.reserveHeads : this.heads;
    const keys = reserved ? this.reserveKeys : this.keys;
    let slot = Math.imul(key ^ Math.floor(key / 65536), 0x9e3779b1) & this.mask;
    while (heads[slot] !== -1 && keys[slot] !== key) slot = (slot + 1) & this.mask;
    return heads[slot]!;
  }

  following(index: number, reserved: boolean): number {
    return (reserved ? this.reserveNext : this.next)[index]!;
  }

  private insert(x: number, z: number, index: number, reserved: boolean): void {
    const key = crowdCellKey(x, z);
    const heads = reserved ? this.reserveHeads : this.heads;
    const keys = reserved ? this.reserveKeys : this.keys;
    const next = reserved ? this.reserveNext : this.next;
    let slot = Math.imul(key ^ Math.floor(key / 65536), 0x9e3779b1) & this.mask;
    while (heads[slot] !== -1 && keys[slot] !== key) slot = (slot + 1) & this.mask;
    keys[slot] = key;
    next[index] = heads[slot]!;
    heads[slot] = index;
  }
}

// Numeric slots: x, z, radius, elevation, height, arrival radius, presence bits (elevation=1, height=2).
// Snapshot records append reserved x/z/elevation and its elevation-presence bit at slots 7..10.
type MutableCrowdBody = { readonly values: Float64Array; layer?: string };
interface MutableCrowdRecord {
  id: number;
  bodyKey: string;
  reservationKey: string;
  body: MutableCrowdBody;
  reservedLayer?: string;
}
function createCrowdBody(size = 7): MutableCrowdBody {
  return { values: new Float64Array(size), layer: undefined };
}
function createCrowdRecord(): MutableCrowdRecord {
  return { id: -1, bodyKey: "", reservationKey: "", body: createCrowdBody(11), reservedLayer: undefined };
}
function copyCrowdBody(source: CrowdQueryBody, target: MutableCrowdBody): void {
  const v = target.values;
  v[0] = source.motion.x;
  v[1] = source.motion.z;
  v[2] = source.radius;
  v[3] = source.elevation ?? 0;
  v[4] = source.height ?? 0;
  v[5] = source.steering?.arrivalRadius ?? 0;
  v[6] = (source.elevation !== undefined ? 1 : 0) | (source.height !== undefined ? 2 : 0);
  target.layer = source.layer;
}
function crowdBodyChanged(body: GroundAnimalBody, previous: MutableCrowdBody): boolean {
  const v = previous.values;
  return (
    v[0] !== body.motion.x ||
    v[1] !== body.motion.z ||
    v[2] !== body.radius ||
    v[3] !== (body.elevation ?? 0) ||
    v[4] !== (body.height ?? 0) ||
    v[5] !== (body.steering?.arrivalRadius ?? 0) ||
    v[6] !== ((body.elevation !== undefined ? 1 : 0) | (body.height !== undefined ? 2 : 0)) ||
    previous.layer !== body.layer
  );
}
function crowdCellKey(x: number, z: number): number {
  return (x + 32768) * 65536 + z + 32768;
}

/**
 * A leased query. Release in a finally block and never use the reference after release.
 * Obstruction corners are scratch values, valid until the next obstruction call on this lease.
 */
export class GroundAnimalRouteQuery implements AnimalRouteQuery {
  private snapshot?: PooledCrowdSnapshot;
  private subjectId = -1;
  private readonly subject = createCrowdBody();
  // Keep float inputs/results in retained storage across method calls; V8 otherwise boxes them.
  private readonly hitValues = new Float64Array(5);
  private readonly corners: [number, number][] = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0]
  ];
  private readonly hit = { key: "", corners: this.corners };

  constructor(private readonly owner: GroundAnimalCrowd) {}

  /** @internal */
  reset(
    snapshot: PooledCrowdSnapshot,
    body: GroundAnimalBody,
    id: number,
    overrides: { values: Float64Array; layer: string | undefined }
  ): void {
    this.snapshot = snapshot;
    snapshot.references++;
    copyCrowdBody(body, this.subject);
    if (overrides.values[1]) {
      this.subject.values[3] = overrides.values[0]!;
      this.subject.values[6] = this.subject.values[6]! | 1;
    }
    this.subject.layer = overrides.layer;
    this.subjectId = id;
  }

  release(): void {
    if (!this.snapshot) return;
    this.snapshot.references--;
    this.snapshot = undefined;
    this.owner.recycleRouteQuery(this);
  }

  canTraverse(from: AnimalRoutePoint, to: AnimalRoutePoint, clearance = 0): boolean {
    return !this.find(from, to, clearance);
  }

  obstruction(from: AnimalRoutePoint, to: AnimalRoutePoint, clearance: number) {
    if (!this.find(from, to, clearance)) return;
    const r = this.hitValues[3]! + 0.001;
    for (let i = 0; i < 4; i++) {
      this.corners[i]![0] = this.hitValues[1]! + (i < 2 ? -r : r);
      this.corners[i]![1] = this.hitValues[2]! + (i % 2 === 0 ? -r : r);
    }
    return this.hit;
  }

  private find(from: AnimalRoutePoint, to: AnimalRoutePoint, clearance: number): boolean {
    const snap = this.snapshot;
    if (!snap) throw new Error("Crowd query has been released");
    const padding = this.subject.values[2]! + Math.max(0, clearance) + 0.001;
    this.hitValues[4] = padding;
    const reach = padding + snap.maximumRadius[0]!;
    const dx = to[0] - from[0],
      dz = to[1] - from[1];
    this.hitValues[0]! = Infinity;
    for (
      let iz = Math.floor((Math.min(from[1], to[1]) - reach) / 4);
      iz <= Math.floor((Math.max(from[1], to[1]) + reach) / 4);
      iz++
    ) {
      let t0 = 0,
        t1 = 1;
      if (dz) {
        const a = (iz * 4 - reach - from[1]) / dz,
          b = ((iz + 1) * 4 + reach - from[1]) / dz;
        t0 = Math.max(0, Math.min(a, b));
        t1 = Math.min(1, Math.max(a, b));
      }
      if (t0 > t1) continue;
      const ax = from[0] + dx * t0,
        bx = from[0] + dx * t1;
      for (
        let ix = Math.floor((Math.min(ax, bx) - reach) / 4);
        ix <= Math.floor((Math.max(ax, bx) + reach) / 4);
        ix++
      ) {
        for (let i = snap.first(ix, iz, false); i !== -1; i = snap.following(i, false))
          this.test(snap.records[i]!, false, from, to);
        for (let i = snap.first(ix, iz, true); i !== -1; i = snap.following(i, true))
          this.test(snap.records[i]!, true, from, to);
      }
    }
    return this.hitValues[0]! !== Infinity;
  }

  private test(state: MutableCrowdRecord, reserved: boolean, from: AnimalRoutePoint, to: AnimalRoutePoint): void {
    if (state.id === this.subjectId) return;
    const own = this.subject.values,
      values = state.body.values;
    const layer = reserved ? state.reservedLayer : state.body.layer;
    if (this.subject.layer === "air" || layer === "air") {
      const hasElevation = reserved ? values[10]! : values[6]! & 1;
      if ((own[6]! & 3) === 3 && values[6]! & 2 && hasElevation) {
        const y = reserved ? values[9]! : values[3]!;
        if (!(own[3]! < y + values[4]! && y < own[3]! + own[4]!)) return;
      } else if ((this.subject.layer ?? "ground") !== (layer ?? "ground")) return;
    }
    const x = values[reserved ? 7 : 0]!,
      z = values[reserved ? 8 : 1]!;
    const radius = this.hitValues[4]! + (values[2]! + (reserved ? values[5]! : 0));
    // Same circle-entry/overlap-escape rule as circleSegmentEntry, without float arguments or return boxing.
    const px = from[0] - x,
      pz = from[1] - z;
    const dx = to[0] - from[0],
      dz = to[1] - from[1];
    const lengthSquared = dx * dx + dz * dz,
      dot = px * dx + pz * dz;
    const c = px * px + pz * pz - radius * radius;
    let t = 0;
    if (c <= 0) {
      const startX = from[0] - own[0]!,
        startZ = from[1] - own[1]!;
      const initialX = own[0]! - x,
        initialZ = own[1]! - z;
      const initialDistanceSquared = initialX * initialX + initialZ * initialZ;
      if (
        (startX * startX + startZ * startZ < 1e-16 && !lengthSquared) ||
        (initialDistanceSquared <= radius * radius && px * px + pz * pz >= initialDistanceSquared - 1e-8 && dot >= 0)
      )
        return;
    } else {
      if (!lengthSquared || dot >= 0) return;
      const discriminant = dot * dot - lengthSquared * c;
      if (discriminant < 0) return;
      t = (-dot - Math.sqrt(discriminant)) / lengthSquared;
      if (t > 1) return;
      t = Math.max(0, t);
    }
    if (t < this.hitValues[0]!) {
      this.hitValues[0]! = t;
      this.hit.key = reserved ? state.reservationKey : state.bodyKey;
      this.hitValues[1]! = x;
      this.hitValues[2]! = z;
      this.hitValues[3]! = radius;
    }
  }
}
