import { Ray } from "@galacean/engine-math";
import type { Camera, Entity } from "@galacean/engine";
import { SeedWorldPicker } from "./SeedWorldPicker";
import type { SeedWorldPickSource } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";

/** One visual depth service for hints and actions. Hints may reuse a recent sample
 * of the same world target during small camera motions; actions require an exact ray/pose. */
export type VisualOcclusionState = "clear" | "blocked" | "unavailable";
export interface VisualQueryRequest {
  readonly ray: Ray;
  readonly ignoredRoot?: Entity;
  readonly distance?: number;
}

export class SeedWorldVisualQuery {
  private readonly abort = new AbortController();
  private readonly picker: SeedWorldPicker;
  private pending?: Promise<boolean>;
  private readonly cached = new Map<string, { distance: number; at: number; generation: number }>();
  private generation = 0;
  private cachedWorld?: unknown;
  private cachedRevision?: number | string;
  private lastHintSubmit = -Infinity;
  private readonly hints = new Map<string, { blocked: boolean; at: number; origin: Ray["origin"] }>();
  private readonly hintRequests = new Map<
    string,
    { ray: Ray; distance: number; ignoredRoot?: Entity; requestedAt: number }
  >();
  private hintFlushQueued = false;
  private pendingKeys = new Set<string>();
  private pendingFrame?: number;
  private deviceEpoch = 0;
  private readonly onDeviceLost = () => {
    this.deviceEpoch++;
    this.cached.clear();
    this.hints.clear();
    this.hintRequests.clear();
  };
  constructor(
    private readonly camera: Camera,
    private readonly world: () => unknown,
    private readonly revision: () => number | string,
    private readonly visit: SeedWorldPickSource,
    picker = new SeedWorldPicker(camera)
  ) {
    this.picker = picker;
    camera.engine.on("devicelost", this.onDeviceLost);
  }

  private key(ray: Ray, ignoredRoot?: Entity): string {
    return [
      ignoredRoot?.instanceId ?? -1,
      this.deviceEpoch,
      this.revision(),
      this.camera.cullingMask,
      this.camera.engine.canvas?.width,
      this.camera.engine.canvas?.height,
      this.camera.viewport?.x,
      this.camera.viewport?.y,
      this.camera.viewport?.z,
      this.camera.viewport?.w,
      ...this.camera.viewMatrix.elements,
      ...this.camera.projectionMatrix.elements,
      ...[ray.origin, ray.direction].flatMap((p) => [p.x, p.y, p.z])
    ].join(",");
  }
  private synchronizeWorld(): void {
    const world = this.world();
    const revision = this.revision();
    if (world !== this.cachedWorld || revision !== this.cachedRevision) {
      this.cached.clear();
      this.hints.clear();
      this.hintRequests.clear();
      this.cachedWorld = world;
      this.cachedRevision = revision;
    }
  }
  private current(ray: Ray, ignoredRoot?: Entity) {
    this.synchronizeWorld();
    const c = this.cached.get(this.key(ray, ignoredRoot));
    return c && !this.abort.signal.aborted && performance.now() - c.at < 150 ? c : undefined;
  }
  /** Action routing must distinguish a blocked target from unavailable evidence. */
  occlusionState(ray: Ray, distance: number, ignoredRoot?: Entity): VisualOcclusionState {
    if (distance <= 0.03) return "clear";
    const cached = this.current(ray, ignoredRoot);
    return !cached ? "unavailable" : cached.distance < distance - 0.03 ? "blocked" : "clear";
  }
  /** Conservative boolean for hints and commit guards, which never choose another action. */
  occluded(ray: Ray, distance: number, ignoredRoot?: Entity): boolean {
    return this.occlusionState(ray, distance, ignoredRoot) !== "clear";
  }
  /** Aggregate hint budget: at most one submission per 100 ms, one readback in flight.
   * Unknown targets stay hidden. Only the same target can retain a result for 500 ms (including a stalled frame),
   * and only while the viewer remains within 75 cm of the sampled origin. */
  hintOccluded(ray: Ray, distance: number, target: string, ignoredRoot?: Entity): boolean {
    this.synchronizeWorld();
    target += `/${ignoredRoot?.instanceId ?? -1}`;
    if (this.abort.signal.aborted) return true;
    const now = performance.now(),
      cached = this.hints.get(target);
    if (!cached || now - cached.at >= (cached.blocked ? 200 : 100)) {
      // Collect the caller's candidate set before scheduling: iteration order must
      // not let two blocked candidates consume the entire refresh budget.
      let request = this.hintRequests.get(target);
      if (!request) {
        if (this.hintRequests.size >= 16) this.hintRequests.delete(this.hintRequests.keys().next().value!);
        this.hintRequests.set(target, (request = { ray: new Ray(), distance, ignoredRoot, requestedAt: now }));
      }
      request.ray.origin.copyFrom(ray.origin);
      request.ray.direction.copyFrom(ray.direction);
      request.distance = distance;
      request.requestedAt = now;
      if (!this.hintFlushQueued) {
        this.hintFlushQueued = true;
        queueMicrotask(() => {
          this.hintFlushQueued = false;
          this.flushHints();
        });
      }
    }
    return (
      !cached ||
      now - cached.at > 500 ||
      Math.hypot(ray.origin.x - cached.origin.x, ray.origin.y - cached.origin.y, ray.origin.z - cached.origin.z) >
        0.75 ||
      cached.blocked
    );
  }
  private flushHints(): void {
    if (this.pending || this.abort.signal.aborted) return;
    const now = performance.now();
    if (now - this.lastHintSubmit < 100) return;
    let chosen: string | undefined,
      oldest = Infinity;
    for (const [key, request] of this.hintRequests) {
      if (now - request.requestedAt > 120) {
        this.hintRequests.delete(key);
        continue;
      }
      const cached = this.hints.get(key);
      if (cached && now - cached.at < (cached.blocked ? 200 : 100)) continue;
      const at = cached?.at ?? -Infinity;
      if (chosen === undefined || at < oldest) {
        chosen = key;
        oldest = at;
      }
    }
    if (chosen === undefined) return;
    const request = this.hintRequests.get(chosen)!;
    this.hintRequests.delete(chosen);
    this.lastHintSubmit = now;
    void this.sample(request.ray, request.ignoredRoot, { target: chosen, distance: request.distance }).catch(() => {});
  }
  /** A forced action samples a fresh frame. Concurrent callers for that same
   * frame/ray/policy share the existing render and readback, including while pending. */
  prepare(ray: Ray, ignoredRoot?: Entity, force = false): Promise<boolean> {
    return this.prepareMany([{ ray, ignoredRoot }], force);
  }
  prepareMany(requests: readonly VisualQueryRequest[], force = false): Promise<boolean> {
    return this.prepareRequests(requests, force, false);
  }
  /** Ordered visibility candidates. Stop after the first clear candidate; later
   * incompatible regions need neither a render nor a readback. */
  prepareVisible(requests: readonly (VisualQueryRequest & { readonly distance: number })[]): Promise<boolean> {
    return this.prepareRequests(requests, true, true);
  }
  private async prepareRequests(
    requests: readonly VisualQueryRequest[],
    force: boolean,
    firstVisible: boolean
  ): Promise<boolean> {
    if (this.abort.signal.aborted) return false;
    if (!requests.length) return true;
    const unique = new Map<string, VisualQueryRequest>();
    for (const { ray, ignoredRoot, distance } of requests) {
      const key = this.key(ray, ignoredRoot);
      if (!unique.has(key))
        unique.set(key, { ray: new Ray(ray.origin.clone(), ray.direction.clone()), ignoredRoot, distance });
    }
    const copies = [...unique.values()];
    if (!force && copies.every((r) => this.current(r.ray, r.ignoredRoot))) return true;
    if (this.pending) {
      const shared =
        (this.pendingFrame === undefined || this.pendingFrame === this.camera.engine.time?.frameCount) &&
        [...unique.keys()].every((key) => this.pendingKeys.has(key));
      const generation = this.generation,
        world = this.world();
      let sampled = false;
      try {
        sampled = await this.pending;
      } catch {
        // Waiting for the picker to become idle does not depend on unrelated
        // evidence succeeding. The current request still owns its validity.
      }
      if (
        this.abort.signal.aborted ||
        world !== this.world() ||
        copies.some((r) => !unique.has(this.key(r.ray, r.ignoredRoot)))
      )
        return false;
      // A shared sample belongs to this action too: its failure must not retry
      // or authorize the action. An unrelated failed hint may release the slot
      // for a new, still-current action to take its own sample.
      if (shared && !sampled) return false;
      if (shared && copies.every((r) => this.current(r.ray, r.ignoredRoot)?.generation === generation)) return true;
      return this.prepareRequests(copies, force, firstVisible);
    }
    return this.sampleMany(copies, undefined, firstVisible);
  }
  private sample(ray: Ray, ignoredRoot?: Entity, hint?: { target: string; distance: number }): Promise<boolean> {
    return this.sampleMany([{ ray, ignoredRoot }], hint);
  }
  private async sampleMany(
    requests: readonly VisualQueryRequest[],
    hint?: { target: string; distance: number },
    firstVisible = false
  ): Promise<boolean> {
    const copies = requests.map((r) => ({
      ray: new Ray(r.ray.origin.clone(), r.ray.direction.clone()),
      ignoredRoot: r.ignoredRoot,
      distance: r.distance
    }));
    const world = this.world(),
      revision = this.revision(),
      epoch = this.deviceEpoch,
      generation = ++this.generation;
    this.pendingFrame = undefined;
    this.pendingKeys = new Set(copies.map((r) => this.key(r.ray, r.ignoredRoot)));
    const valid = () =>
      !this.abort.signal.aborted &&
      revision === this.revision() &&
      epoch === this.deviceEpoch &&
      world === this.world();
    const task = (async () => {
      await this.picker.waitForFrame(this.abort.signal);
      if (!valid()) return false;
      if (hint) {
        const copy = copies[0].ray;
        const endpoint = copy.getPoint(hint.distance, copy.direction.clone());
        copy.origin.copyFrom(this.camera.entity.transform.worldPosition);
        copy.direction.copyFrom(endpoint).subtract(copy.origin);
        hint.distance = copy.direction.length();
        copy.direction.normalize();
      }
      const keys = copies.map((r) => this.key(r.ray, r.ignoredRoot)),
        sampledAt = performance.now();
      this.pendingKeys = new Set(keys);
      this.pendingFrame = this.camera.engine.time?.frameCount;
      if (hint) this.lastHintSubmit = sampledAt;
      try {
        const distances =
          copies.length === 1
            ? [await this.picker.depthAlongRay(this.visit, copies[0].ray, this.abort.signal, copies[0].ignoredRoot)]
            : await this.picker.depthAlongRays(
                this.visit,
                copies,
                this.abort.signal,
                firstVisible ? (distance, i) => distance >= copies[i].distance! - 0.03 : undefined
              );
        if (!valid()) return false;
        this.synchronizeWorld();
        for (let i = 0; i < copies.length; i++) {
          if (distances[i] === undefined) continue;
          const key = keys[i];
          this.cached.delete(key);
          if (this.cached.size >= 16) this.cached.delete(this.cached.keys().next().value!);
          this.cached.set(key, { distance: distances[i]!, at: sampledAt, generation });
        }
        if (hint) {
          if (this.hints.size >= 16 && !this.hints.has(hint.target)) this.hints.delete(this.hints.keys().next().value!);
          this.hints.set(hint.target, {
            blocked: distances[0]! < hint.distance - 0.03,
            at: sampledAt,
            origin: copies[0].ray.origin
          });
        }
        return copies.every((r, i) => keys[i] === this.key(r.ray, r.ignoredRoot));
      } catch {
        for (const key of keys) this.cached.delete(key);
        if (hint) this.hints.delete(hint.target);
        return false;
      }
    })();
    this.pending = task;
    try {
      return await task;
    } catch {
      return false;
    } finally {
      if (this.pending === task) {
        this.pending = undefined;
        this.pendingKeys.clear();
        this.pendingFrame = undefined;
      }
    }
  }
  async prepareShaders(): Promise<void> {
    const ray = new Ray(
      this.camera.entity.transform.worldPosition.clone(),
      this.camera.entity.transform.worldForward.clone()
    );
    await this.prepare(ray);
  }
  dispose(): void {
    this.abort.abort();
    this.camera.engine.off("devicelost", this.onDeviceLost);
    this.cached.clear();
    this.hints.clear();
    this.hintRequests.clear();
    this.cachedWorld = undefined;
    this.picker.dispose();
  }
}
