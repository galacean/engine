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
  /** No supported forward or retreat step is available. */
  surfaceBlocked?: boolean;
  /** Shared with coarse simulation when this body is streamed out. */
  recovery?: GroundAnimalRecovery;
  /** Optional pose constraint, evaluated even while stopped so traffic can wake a waiting tree. */
  motionFraction?(seconds: number, proposed: Readonly<GroundAnimalMotion>): number;
  /** Reject translation on unsupported ground; rotation stops with rejected travel. */
  canTranslate?(proposed: Readonly<GroundAnimalMotion>, from?: Readonly<GroundAnimalMotion>): boolean;
}
interface BodyState {
  id: number;
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
  private neighbourChecks = 0;
  private constrainedSteps = 0;
  private steps = 0;
  private milliseconds = 0;
  private maxMilliseconds = 0;
  private worstClearance = Infinity;

  /** Register a footprint; unsafe spawns are rejected instead of silently moving other animals. */
  add(body: GroundAnimalBody): void {
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
      reservedNeighbours: []
    };
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
    const [state] = this.states.splice(i, 1);
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
    Object.assign(state.next, body.motion);
    body.blocked = body.arrived = false;
  }

  /** A new task waypoint releases the previous traffic wait; no other actors' velocities are predicted. */
  publishIntent(body: GroundAnimalBody): void {
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
    const bucket = this.reservations.get(r.cellKey)!;
    bucket.splice(bucket.indexOf(state!), 1);
    if (!bucket.length) this.reservations.delete(r.cellKey);
    state!.reservation = undefined;
  }

  /**
   * Capture decision-time route checks against present footprints and reserved resting goals.
   * Movement uses neither this query nor predictions of neighbouring animals' future motion.
   * A currently overlapping actor may leave outward; final resting occupancy still uses canReserve.
   */
  routeQuery(body: GroundAnimalBody, elevation = body.elevation, layer = body.layer): AnimalRouteQuery {
    const subject = { ...body, elevation, layer };
    const find = (from: AnimalRoutePoint, to: AnimalRoutePoint, clearance = 0) => {
      const padding = subject.radius + Math.max(0, clearance) + 0.001;
      const reach = padding + this.maximumRadius;
      let nearest: BodyState | undefined,
        reserved = false,
        hitX = 0,
        hitZ = 0,
        hitRadius = 0,
        first = Infinity;
      const test = (state: BodyState, x: number, z: number, isReserved: boolean) => {
        if (
          state.body === body ||
          !(isReserved ? sharesReservationHeight(subject, state) : sharesHeight(subject, state.body))
        )
          return;
        const radius = padding + (isReserved ? restingRadius(state.body) : state.body.radius);
        const t = circleSegmentEntry(from, to, x, z, radius, body.motion.x, body.motion.z);
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
          for (const state of this.grid.get(key) ?? []) test(state, state.body.motion.x, state.body.motion.z, false);
          for (const state of this.reservations.get(key) ?? [])
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
    Object.assign(state.next, body.motion);
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
      const retreatFromTraffic = behind && limit < Math.min(0.12, b.desiredSpeed * 0.3);
      let recovered = false;
      if (
        b.layer !== "air" &&
        b.desiredSpeed > 0 &&
        !b.arrived &&
        ((!b.blocked && (!supported || closeBehind)) || s.recovery.recovering || retreatFromTraffic)
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

  private key(x: number, z: number): number {
    return (x + 32768) * 65536 + z + 32768;
  }

  private removeFromGrid(state: BodyState): void {
    const bucket = this.grid.get(state.cellKey)!;
    bucket.splice(bucket.indexOf(state), 1);
    if (bucket.length === 0) this.grid.delete(state.cellKey);
  }

  private updateGrid(state: BodyState): void {
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

function sharesHeight(a: GroundAnimalBody, b: GroundAnimalBody, elevation = b.elevation): boolean {
  // Ground animals must avoid each other even across a slope: their heights
  // change with the terrain as they move. Only actual flight separates travel planes.
  if (a.layer !== "air" && b.layer !== "air") return true;
  if (a.elevation !== undefined && elevation !== undefined && a.height !== undefined && b.height !== undefined)
    return a.elevation < elevation + b.height && elevation < a.elevation + a.height;
  return (a.layer ?? "ground") === (b.layer ?? "ground");
}

function sharesReservationHeight(body: GroundAnimalBody, state: BodyState): boolean {
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
function restingRadius(body: GroundAnimalBody, radius = body.radius): number {
  return radius + (body.steering?.arrivalRadius ?? 0);
}
