import type { AnimalPlanningTask } from "./AnimalPlanningTask";
import { Animal, type AnimalDefinition, type AnimalRoamingArea } from "./Animal";

/** Runtime work owned by one animal, independent of its render asset and capabilities. */
export interface AnimalAgent {
  /** Resume a behavior tree after a queued event. */
  evaluateBehavior(): void;
  /** Integrate active movement in simulation seconds. */
  advanceMotion(seconds: number, coarse?: boolean): void;
  /** Flush any deferred pose evaluation accumulated during bounded simulation substeps. */
  flushPose?(): void;
  /** Cancel work and unregister from the system. */
  dispose(): void;
  /** Optional capability hook for suspending bounded perception while its component is disabled. */
  setActive?(active: boolean): void;
}

interface PlanningWork {
  owner: AnimalAgent;
  running?: boolean;
  task: AnimalPlanningTask<unknown>;
  finish(value: unknown): void;
}

interface Deadline {
  at: number;
  order: number;
  index: number;
  callback: () => void;
  owner?: AnimalAgent;
  remaining?: number;
}

/** One simulation clock, cancellable deadline heap and fair, deduplicated behavior queue. */
export class AnimalSystem {
  private readonly _motionStepsBefore = new Set<(seconds: number) => void>();
  private readonly _animals = new Set<AnimalAgent>();
  private readonly _moving = new Set<AnimalAgent>();
  private readonly _requestedMoving = new Set<AnimalAgent>();
  private readonly _inactive = new Set<AnimalAgent>();
  private readonly _wakes = new Set<AnimalAgent>();
  private readonly _motionIntervals = new Map<AnimalAgent, { seconds: number; at: number; cancel?: () => void }>();
  private readonly _deadlines: Deadline[] = [];
  private readonly _ownedDeadlines = new Map<AnimalAgent, Set<Deadline>>();
  private readonly _decisionQueue: AnimalAgent[] = [];
  private readonly _planning = new Set<PlanningWork>();
  private _lastPlanningSteps = 0;
  private _lastPlanningMilliseconds = 0;
  private _time = 0;
  private _order = 0;
  private _disposed = false;
  private _evaluations = 0;
  private _motionSteps = 0;
  private _lastEvaluations = 0;
  private _deferringPose = false;
  private readonly _pendingPoseFlush = new Set<AnimalAgent>();

  /**
   * Shared per-update budgets for decisions and cooperative route planning.
   * Planning stops at the first time/step limit; an atomic geometry query can overrun the time limit.
   * Zero simulation time and disabled owners preserve continuations without running them.
   */
  constructor(
    readonly maxDecisionsPerFrame = 32,
    readonly maxPlanningMilliseconds = 2,
    readonly maxPlanningSteps = 512
  ) {
    if (
      !Number.isFinite(maxPlanningMilliseconds) ||
      maxPlanningMilliseconds <= 0 ||
      !Number.isSafeInteger(maxPlanningSteps) ||
      maxPlanningSteps < 1
    )
      throw new RangeError("Animal planning budgets must be positive");
    if (!Number.isSafeInteger(maxDecisionsPerFrame) || maxDecisionsPerFrame < 1) {
      throw new RangeError("Animal decision budget must be a positive integer");
    }
  }

  get time(): number {
    return this._time;
  }

  /** True during intermediate 1/60s substeps so pose evaluation can run once per rendered frame. @internal */
  get deferringPose(): boolean {
    return this._deferringPose;
  }

  /** @internal */
  markPendingPoseFlush(animal: AnimalAgent): void {
    this._pendingPoseFlush.add(animal);
  }

  /** Diagnostic snapshot; request on demand rather than allocating in the animation loop. */
  get stats() {
    let pausedDeadlines = 0;
    for (const deadlines of this._ownedDeadlines.values())
      for (const deadline of deadlines) if (deadline.remaining !== undefined) pausedDeadlines++;
    return {
      planningTasks: this._planning.size,
      lastPlanningSteps: this._lastPlanningSteps,
      lastPlanningMilliseconds: this._lastPlanningMilliseconds,
      animals: this._animals.size,
      moving: this._moving.size,
      pendingWakes: this._wakes.size,
      coarse: this._motionIntervals.size,
      deadlines: this._deadlines.length,
      pausedDeadlines,
      evaluations: this._evaluations,
      lastEvaluations: this._lastEvaluations,
      motionSteps: this._motionSteps
    };
  }

  /** Creates an independent animal; its first decision runs on the next positive-time update. */
  createAnimal(
    definition: AnimalDefinition,
    seed: number,
    area: AnimalRoamingArea,
    position: readonly [number, number]
  ): Animal {
    if (this._disposed) throw new Error("Animal system is disposed");
    const animal = new Animal(definition, seed, area, position, this);
    this.register(animal);
    return animal;
  }

  /** Register a capability runtime; the first decision is queued rather than executed inline. */
  register(animal: AnimalAgent): void {
    if (this._disposed) throw new Error("Animal system is disposed");
    this._animals.add(animal);
    this.requestWake(animal);
  }

  /** Advance only moving animals. Zero time freezes timers AND queued decisions for pause. */
  update(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Animal time must be finite and nonnegative");
    this._lastEvaluations = 0;
    this._lastPlanningSteps = this._lastPlanningMilliseconds = 0;
    if (this._disposed || seconds === 0) return;
    // Full-motion integration stays independent of other owners' deadlines, so
    // adding an animal cannot change an existing animal's deterministic trajectory.
    let remaining = seconds;
    try {
      while (remaining > 1e-8 && this._moving.size) {
        const dt = Math.min(remaining, 1 / 60);
        remaining -= dt;
        this._deferringPose = remaining > 1e-8;
        for (const step of this._motionStepsBefore) step(dt);
        for (const animal of this._moving) {
          animal.advanceMotion(dt);
          this._motionSteps++;
        }
      }
    } finally {
      this._deferringPose = false;
      if (this._pendingPoseFlush.size) {
        for (const animal of this._pendingPoseFlush) animal.flushPose?.();
        this._pendingPoseFlush.clear();
      }
    }
    const end = this._time + seconds;
    while (this._deadlines.length && this._deadlines[0].at <= end) {
      this._time = Math.max(this._time, this._deadlines[0].at);
      const order = this._order;
      while (this._deadlines.length && this._deadlines[0].at <= this._time && this._deadlines[0].order < order) {
        const deadline = this._deadlines[0];
        // Commit the old task up to its event time before a timeout can cancel it.
        // Synchronization may complete/cancel this deadline, including a motion ticket itself.
        if (deadline.owner) this.synchronizeMotion(deadline.owner);
        if (deadline.index < 0) continue;
        this._releaseDeadline(deadline);
        deadline.callback();
      }
      // A zero-delay callback may rearm itself; defer that new work to the next update.
      if (this._deadlines[0]?.at <= this._time) break;
    }
    this._time = end;
    // Snapshot the eligible count: a terminal tree cannot restart itself indefinitely in this frame.
    const count = Math.min(this._wakes.size, this.maxDecisionsPerFrame);
    const queue = this._decisionQueue;
    for (const animal of this._wakes) {
      queue.push(animal);
      if (queue.length === count) break;
    }
    try {
      for (const animal of queue) {
        if (!this._animals.has(animal) || this._inactive.has(animal)) {
          this._wakes.delete(animal);
          continue;
        }
        this.synchronizeMotion(animal);
        this._wakes.delete(animal);
        animal.evaluateBehavior();
        this._evaluations++;
        this._lastEvaluations++;
      }
    } finally {
      queue.length = 0;
    }
    this._advancePlanning();
  }

  /** Schedule CPU work without advancing it inline. Disabled owners retain their continuation. */
  plan<T>(owner: AnimalAgent, task: AnimalPlanningTask<T>, finish: (value: T) => void): () => void {
    if (this._disposed || !this._animals.has(owner)) throw new Error("Planning requires a registered animal");
    const work: PlanningWork = { owner, task, finish: (value) => finish(value as T) };
    this._planning.add(work);
    return () => this._cancelPlanning(work);
  }

  private _cancelPlanning(work: PlanningWork): void {
    if (this._planning.delete(work) && !work.running) work.task.return(undefined);
  }

  private _advancePlanning(): void {
    const start = performance.now();
    let skipped = 0;
    const available = () =>
      this._lastPlanningSteps < this.maxPlanningSteps && performance.now() - start < this.maxPlanningMilliseconds;
    try {
      while (this._planning.size && available()) {
        const work = this._planning.values().next().value!;
        // Give one continuation the remaining frame slice. Rotating after every
        // query spreads short pose-dependent validations over many moving frames.
        // Rotate before running so an unfinished task yields to its peers next frame.
        this._planning.delete(work);
        this._planning.add(work);
        if (this._inactive.has(work.owner)) {
          if (++skipped >= this._planning.size) break;
          continue;
        }
        skipped = 0;
        do {
          this._lastPlanningSteps++;
          let result: IteratorResult<void, unknown>;
          work.running = true;
          try {
            result = work.task.next();
          } catch (error) {
            this._planning.delete(work);
            throw error;
          } finally {
            work.running = false;
          }
          if (!this._planning.has(work)) {
            work.task.return(undefined);
            break;
          }
          // A query may synchronously cancel its owner or replace the task.
          if (result.done) {
            this._planning.delete(work);
            work.finish(result.value);
            break;
          }
        } while (!this._inactive.has(work.owner) && available());
      }
    } finally {
      this._lastPlanningMilliseconds = performance.now() - start;
    }
  }

  /**
   * Select motion precision without pausing tasks, animation events or behavior deadlines.
   * @param animal Registered agent; all capabilities use the same scheduling path.
   * @param seconds Zero integrates each frame; a positive interval schedules coarse motion only while moving.
   */
  setMotionInterval(animal: AnimalAgent, seconds = 0): void {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 5) throw new RangeError("Invalid motion interval");
    if (!this._animals.has(animal)) return;
    const previous = this._motionIntervals.get(animal);
    if ((previous?.seconds ?? 0) === seconds) return;
    this.synchronizeMotion(animal);
    previous?.cancel?.();
    this._motionIntervals.delete(animal);
    if (seconds > 0) {
      this._moving.delete(animal);
      this._motionIntervals.set(animal, { seconds, at: this._time });
      this._scheduleMotion(animal);
    } else if (this._requestedMoving.has(animal) && !this._inactive.has(animal)) this._moving.add(animal);
  }

  /** Bring a coarse moving agent to the shared time before a command or visibility transition. */
  synchronizeMotion(animal: AnimalAgent): void {
    const interval = this._motionIntervals.get(animal);
    if (!interval || this._inactive.has(animal) || !this._requestedMoving.has(animal)) return;
    const seconds = this._time - interval.at;
    if (seconds <= 1e-8) return;
    interval.cancel?.();
    interval.cancel = undefined;
    interval.at = this._time;
    animal.advanceMotion(seconds, true);
    this._motionSteps++;
    this._scheduleMotion(animal);
  }

  /** Seconds of uncommitted coarse motion, for conservative visibility admission. */
  motionLag(animal: AnimalAgent): number {
    const interval = this._motionIntervals.get(animal);
    return interval && this._requestedMoving.has(animal) && !this._inactive.has(animal)
      ? Math.max(0, this._time - interval.at)
      : 0;
  }

  private _scheduleMotion(animal: AnimalAgent): void {
    const interval = this._motionIntervals.get(animal);
    if (!interval || interval.cancel || this._inactive.has(animal) || !this._requestedMoving.has(animal)) return;
    interval.cancel = this.schedule(
      interval.seconds,
      () => {
        interval.cancel = undefined;
        this.synchronizeMotion(animal);
      },
      animal
    );
  }

  /** Register a shared movement world; runs once before actor animation in every bounded substep. */
  addMotionStep(step: (seconds: number) => void): () => void {
    this._motionStepsBefore.add(step);
    return () => this._motionStepsBefore.delete(step);
  }

  /** @internal Completion events enqueue; they never evaluate a tree inline. */
  requestWake(animal: AnimalAgent): void {
    if (this._animals.has(animal)) this._wakes.add(animal);
  }

  /** @internal Sleeping animals leave the per-frame motion loop entirely. */
  setMoving(animal: AnimalAgent, moving: boolean): void {
    if (moving && this._animals.has(animal)) {
      if (!this._requestedMoving.has(animal)) {
        const interval = this._motionIntervals.get(animal);
        if (interval) interval.at = this._time;
      }
      this._requestedMoving.add(animal);
      const interval = this._motionIntervals.get(animal);
      if (interval) this._scheduleMotion(animal);
      else if (!this._inactive.has(animal)) this._moving.add(animal);
    } else {
      this._requestedMoving.delete(animal);
      this._moving.delete(animal);
      const interval = this._motionIntervals.get(animal);
      interval?.cancel?.();
      if (interval) {
        interval.cancel = undefined;
        interval.at = this._time;
      }
    }
  }

  /**
   * Suspend component-owned work without disposing the animal or resetting the scene clock.
   * @param animal Registered animal capability runtime.
   * @param active True to restore motion membership and request a fresh decision.
   */
  setActive(animal: AnimalAgent, active: boolean): void {
    if (!this._animals.has(animal) || this._inactive.has(animal) === !active) return;
    if (!active) this.synchronizeMotion(animal);
    if (active) {
      this._inactive.delete(animal);
      const interval = this._motionIntervals.get(animal);
      if (interval) interval.at = this._time;
      for (const deadline of this._ownedDeadlines.get(animal) ?? []) {
        if (deadline.remaining === undefined) continue;
        deadline.at = this._time + deadline.remaining;
        deadline.remaining = undefined;
        deadline.index = this._deadlines.length;
        this._deadlines.push(deadline);
        this._up(deadline.index);
      }
      if (this._requestedMoving.has(animal)) this.setMoving(animal, true);
      this.requestWake(animal);
    } else {
      this._inactive.add(animal);
      this._moving.delete(animal);
      this._wakes.delete(animal);
      for (const deadline of this._ownedDeadlines.get(animal) ?? []) {
        if (deadline.index < 0) continue;
        deadline.remaining = Math.max(0, deadline.at - this._time);
        this._removeDeadline(deadline.index);
      }
    }
    animal.setActive?.(active);
  }

  /**
   * Schedule against simulation time. Cancellation removes the pending task immediately.
   * @param delay Nonnegative simulation seconds before the callback.
   * @param callback Invoked once when the active delay elapses.
   * @param owner Optional registered animal; its remaining delay pauses while inactive and is cancelled on removal.
   * @returns Idempotent cancellation, including while the owning animal is paused.
   */
  schedule(delay: number, callback: () => void, owner?: AnimalAgent): () => void {
    if (this._disposed) throw new Error("Animal system is disposed");
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError("Deadline delay must be finite and nonnegative");
    if (owner && !this._animals.has(owner)) throw new Error("Deadline owner must be a registered animal");
    const paused = !!owner && this._inactive.has(owner);
    const deadline: Deadline = {
      at: this._time + delay,
      order: this._order++,
      index: paused ? -1 : this._deadlines.length,
      callback,
      owner,
      remaining: paused ? delay : undefined
    };
    if (owner) {
      let owned = this._ownedDeadlines.get(owner);
      if (!owned) this._ownedDeadlines.set(owner, (owned = new Set()));
      owned.add(deadline);
    }
    if (!paused) {
      this._deadlines.push(deadline);
      this._up(deadline.index);
    }
    return () => this._releaseDeadline(deadline);
  }

  /** @internal Removes queued decisions and motion; Animal cancels its task deadline. */
  remove(animal: AnimalAgent): void {
    for (const work of this._planning) {
      if (work.owner !== animal) continue;
      this._cancelPlanning(work);
    }
    this._animals.delete(animal);
    this._moving.delete(animal);
    this._requestedMoving.delete(animal);
    this._inactive.delete(animal);
    this._wakes.delete(animal);
    this._motionIntervals.delete(animal);
    for (const deadline of this._ownedDeadlines.get(animal) ?? []) this._releaseDeadline(deadline);
  }

  /** Cancels all animals, deadlines and pending decisions. The host can create a fresh system to restart. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const animal of this._animals) animal.dispose();
    for (const deadline of this._deadlines) deadline.index = -1;
    for (const deadlines of this._ownedDeadlines.values())
      for (const deadline of deadlines) deadline.remaining = undefined;
    this._ownedDeadlines.clear();
    for (const work of this._planning) this._cancelPlanning(work);
    this._planning.clear();
    this._animals.clear();
    this._deadlines.length = 0;
    this._wakes.clear();
    this._motionIntervals.clear();
    this._moving.clear();
    this._requestedMoving.clear();
    this._inactive.clear();
    this._motionStepsBefore.clear();
  }

  private _before(a: Deadline, b: Deadline): boolean {
    return a.at < b.at || (a.at === b.at && a.order < b.order);
  }

  private _releaseDeadline(deadline: Deadline): void {
    if (deadline.index >= 0) this._removeDeadline(deadline.index);
    if (deadline.owner) {
      const owned = this._ownedDeadlines.get(deadline.owner);
      owned?.delete(deadline);
      if (owned?.size === 0) this._ownedDeadlines.delete(deadline.owner);
    }
    deadline.remaining = undefined;
  }

  private _swap(a: number, b: number): void {
    const heap = this._deadlines;
    [heap[a], heap[b]] = [heap[b], heap[a]];
    heap[a].index = a;
    heap[b].index = b;
  }

  private _up(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this._before(this._deadlines[index], this._deadlines[parent])) break;
      this._swap(index, parent);
      index = parent;
    }
  }

  private _removeDeadline(index: number): Deadline {
    const heap = this._deadlines;
    const removed = heap[index];
    const last = heap.pop()!;
    removed.index = -1;
    if (index < heap.length) {
      heap[index] = last;
      last.index = index;
      if (index > 0 && this._before(last, heap[(index - 1) >> 1])) this._up(index);
      else {
        while (index * 2 + 1 < heap.length) {
          let child = index * 2 + 1;
          if (child + 1 < heap.length && this._before(heap[child + 1], heap[child])) child++;
          if (!this._before(heap[child], heap[index])) break;
          this._swap(index, child);
          index = child;
        }
      }
    }
    return removed;
  }
}
