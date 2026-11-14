import { BehaviorTree, type BehaviorAction, type BehaviorNode, type BehaviorStatus } from "../behavior/BehaviorTree";

/** Registered world query; identifiers and parameter contracts belong to the host. */
export interface AnimalTargetQuery {
  query: string;
  params?: Record<string, unknown>;
}

/** Public intent. No clip names, animation weights or behavior-tree nodes cross this boundary. */
export interface AnimalTaskRequest {
  requestId: string;
  skillId: string;
  target?: AnimalTargetQuery;
}

/** Observable operation; accepted/running tasks have not completed their goal. */
export interface AnimalTaskReceipt extends AnimalTaskRequest {
  status: "accepted" | "running" | "completed" | "cancelled" | "failed" | "rejected";
  reason?: string;
}

/** Weighted semantic binding. Every activation plays one authored clip; the tree chooses what follows. */
export interface AnimalAnimationChoice {
  clip: string;
  weight: number;
  /** Metres/second for this clip, before the host applies instance scale/calibration. */
  speed?: number;
  /** Physical domain of this pose; absent preserves legacy ground behavior. */
  medium?: "ground" | "air" | "water";
  /** Optional world guard evaluated before this clip participates in weighted selection. */
  when?: AnimalTargetQuery;
}

/** A registered task recipe, composed from validated runtime actions rather than source clip names. */
export interface AnimalTaskSkill {
  label: string;
  tree: BehaviorNode;
  /** Compatible destination intents may change pace without cancelling an ongoing stride. */
  movementIntent?: "slow" | "fast";
  repeat?: boolean;
  /** Selecting a background mode completes the command immediately; events can interrupt that mode. */
  background?: boolean;
  requiresTarget?: boolean;
}

/** Asset/application registration. Semantic slots and skill ids remain extensible strings. */
export interface AnimalTaskProfile {
  defaultSkill: string;
  preferredMedium?: "ground" | "air" | "water";
  /** Supported resting surface after flight; used by recovery as well as authored recipes. */
  landingMedium?: "ground" | "water";
  habitatPreferences?: readonly { habitat: string; weight: number }[];
  skills: Record<string, AnimalTaskSkill>;
  animationSlots: Record<string, AnimalAnimationChoice[]>;
  /** Explicit fallback edges; missing slots without an edge fail rather than invent an action. */
  animationFallbacks?: Record<string, string>;
  movementSpeeds: Record<string, number>;
  /** Compatible slower locomotion for low achieved speed; destination and requested travel speed are retained. */
  movementFallbacks?: Record<string, string>;
  reactions: Record<string, { skillId: string; note?: string; interruptTask?: boolean }>;
}

/** Host owns rendering, spatial queries and movement; all deadlines use the shared simulation clock. */
export interface AnimalTaskHost {
  readonly time: number;
  /** Commit pending execution to the shared time before replacing or cancelling its task. */
  synchronize?(): void;
  wake(): void;
  schedule(seconds: number, callback: () => void): () => void;
  /** Positive locomotionSpeed authorizes movement; urgent accelerates escape response.
   * preservePhase retains a compatible gait and returns its remaining duration. */
  play(
    clip: string,
    locomotionSpeed?: number,
    medium?: "ground" | "air" | "water",
    paceMultiplier?: number,
    urgent?: boolean,
    preservePhase?: boolean
  ): number;
  /** Logical clip completion after execution returns; callbacks may select a new clip. Absent hosts use deadlines. */
  onAnimationEnd?(callback: () => void): () => void;
  /** Resolve a world goal; optional unscaled movement speed lets the host reserve a usable departure arc. */
  resolveTarget(
    query: AnimalTargetQuery,
    event: AnimalWorldEvent | null,
    movementSpeed?: number
  ): readonly [number, number] | null;
  /** Commit a completed interaction once; cancellation before clip completion never invokes this hook. */
  completeInteraction?(query: AnimalTargetQuery): void;
  /** Bind a target for continuous interaction; return its shared-clock duration in seconds. */
  beginInteraction?(query: AnimalTargetQuery): number | undefined;
  /** Whether the bound interaction can start timing, such as arrival within the gameplay range. */
  interactionReady?(query: AnimalTargetQuery): boolean;
  /** Release the bound target when an interaction is interrupted or invalidated. */
  cancelInteraction?(query: AnimalTargetQuery): void;
  /** Local traffic blockage: surface motion may wait; airborne motion must replan without losing its gait. */
  movementBlocked?(): boolean;
  /** Decision-time validation of the executable route, beyond host endpoint support. */
  canMoveTo?(target: readonly [number, number], speed: number, arrivalMedium?: "ground" | "water"): boolean;
  /** Prefer a clear turning arc among legal surface goals; never reject every escape or change an exact point. */
  prefersMoveTo?(target: readonly [number, number], speed: number): boolean;
  /** Predictive route invalidation; the task keeps its priority while replacing a landing approach. */
  movementNeedsReplan?(): boolean;
  /** Last supported landing retained during command handover; never exposes a clip or pose. */
  currentLanding?(): readonly [number, number] | null;
  /** True only when the actor already satisfies the requested supported destination. */
  isAtTarget?(target: readonly [number, number], arrivalMedium?: "ground" | "water"): boolean;
  moveTo(
    target: readonly [number, number],
    speed: number,
    finish: (success: boolean) => void,
    arrivalMedium?: "ground" | "water"
  ): () => void;
}

/** Environmental fact, independently dispatched from an explicit actor task. */
export interface AnimalWorldEvent {
  id: string;
  type: string;
  source?: readonly [number, number];
}

/** Caller-facing task contract suitable for tool discovery. */
export interface AnimalTaskDescription {
  skillId: string;
  label: string;
  repeat: boolean;
  background: boolean;
  requiresTarget: boolean;
}

/**
 * Event-driven arbitration: explicit task > environmental reaction > autonomous background mode.
 * Every recipe uses the existing BehaviorTree executor. New commands cancel previous work; background behavior resumes after completion.
 * Recipes resolve current world facts; completed actions release timers and movement before returning.
 */
export class AnimalTaskController {
  private readonly tree: BehaviorTree<AnimalTaskController>;
  private readonly receipts = new Map<string, AnimalTaskReceipt>();
  private command: AnimalTaskReceipt | null = null;
  private event: AnimalWorldEvent | null = null;
  private backgroundSkill: string;
  private paused = false;
  private disposed = false;
  private branch = "default";
  private slot = "";
  private fallback = "";
  private animationPlays = 0;
  private activeTarget: AnimalTargetQuery | null = null;
  private readonly log: string[] = [];
  private movementEffort?: number;
  private paceChanged?: () => void;
  private medium: "ground" | "air" | "water" = "ground";
  private preserveCommandGaitFor?: string;
  private handingOverMovement = false;
  private pendingMoveCancellation?: () => void;

  /** Host feedback in unscaled calibrated metres/second; only a gait threshold crossing wakes the tree. */
  updateMovementEffort(speed: number): void {
    if (this.movementEffort === speed) return;
    this.movementEffort = speed;
    this.paceChanged?.();
  }

  /** Validate a detached registration before rendering or running any actions. */
  constructor(
    readonly profile: AnimalTaskProfile,
    private readonly host: AnimalTaskHost,
    private readonly random: () => number = Math.random
  ) {
    this.profile = structuredClone(profile);
    this.medium = profile.preferredMedium ?? "ground";
    validateAnimalTaskProfile(profile);
    this.backgroundSkill = profile.defaultSkill;
    const guarded = (condition: string, action: string): BehaviorNode => ({
      type: "sequence",
      children: [
        { type: "condition", name: condition },
        { type: "action", name: action }
      ]
    });
    this.tree = new BehaviorTree<AnimalTaskController>(
      {
        type: "selector",
        reactive: true,
        children: [
          guarded("hasCommand", "command"),
          guarded("hasReaction", "reaction"),
          { type: "action", name: "default" }
        ]
      },
      {
        context: this,
        conditions: { hasReaction: () => !!this.event, hasCommand: () => !!this.command },
        actions: {
          reaction: () => this.runRecipe(this.profile.reactions[this.event!.type].skillId, "reaction", this.event),
          command: () => this.runRecipe(this.command!.skillId, "command", this.command),
          default: () => this.runRecipe(this.backgroundSkill, "default", null)
        },
        scheduleWake: () => host.wake(),
        random
      }
    );
  }

  /** Expose task contracts without leaking animation or behavior implementation details. */
  describe(): AnimalTaskDescription[] {
    return Object.entries(this.profile.skills)
      .filter(([id]) => !id.startsWith("_"))
      .map(([skillId, skill]) => ({
        skillId,
        label: skill.label,
        repeat: !!skill.repeat,
        background: !!skill.background,
        requiresTarget: !!skill.requiresTarget
      }));
  }

  /** Build a discoverable task input schema from this registration; source animations stay private. */
  requestSchema() {
    return {
      type: "object",
      additionalProperties: false,
      required: ["requestId", "skillId"],
      properties: {
        requestId: {
          type: "string",
          minLength: 1,
          description: "Stable operation id; retries do not restart an operation."
        },
        skillId: { type: "string", enum: this.describe().map((skill) => skill.skillId) },
        target: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: {
              type: "string",
              minLength: 1,
              description: "A registered world query, not an animation or arbitrary place name."
            },
            params: { type: "object", description: "Arguments defined by the selected world query." }
          }
        }
      }
    };
  }

  /** Latest accepted task replaces its predecessor; unknown ids and invalid queries are rejected. */
  execute(request: AnimalTaskRequest): AnimalTaskReceipt {
    const existing = this.receipts.get(request?.requestId);
    if (existing)
      return existing.skillId === request.skillId && JSON.stringify(existing.target) === JSON.stringify(request.target)
        ? structuredClone(existing)
        : { ...request, status: "rejected", reason: "request_id_conflict" };
    const skill = Object.prototype.hasOwnProperty.call(this.profile.skills, request?.skillId)
      ? this.profile.skills[request.skillId]
      : null;
    const validTarget =
      request?.target === undefined ||
      (request.target &&
        typeof request.target.query === "string" &&
        !!request.target.query &&
        Object.keys(request.target).every((key) => ["query", "params"].includes(key)) &&
        (request.target.params === undefined ||
          (request.target.params !== null &&
            typeof request.target.params === "object" &&
            !Array.isArray(request.target.params))));
    const validFields =
      request && Object.keys(request).every((key) => ["requestId", "skillId", "target"].includes(key));
    if (
      this.disposed ||
      typeof request?.requestId !== "string" ||
      !request.requestId.trim() ||
      !validFields ||
      typeof request.skillId !== "string" ||
      !skill ||
      request.skillId.startsWith("_") ||
      !validTarget ||
      (skill.requiresTarget && !request.target)
    ) {
      return { ...request, status: "rejected", reason: "invalid_task_or_target" };
    }
    this.host.synchronize?.();
    // Updating an explicit destination keeps a compatible moving pose. Events and
    // action commands still replay; changing the goal must not repeatedly reset a stride.
    const previousSkill = this.command && this.profile.skills[this.command.skillId];
    this.preserveCommandGaitFor =
      (this.command?.skillId === request.skillId || (!!previousSkill?.movementIntent && !!skill.movementIntent)) &&
      !!request.target &&
      ["point", "position"].includes(request.target.query)
        ? request.requestId
        : undefined;
    if (this.command) {
      this.command.status = "cancelled";
      this.record(`cancel ${this.command.skillId}`);
    }
    if (!this.preserveCommandGaitFor) this.releasePreviousMovement();
    this.handingOverMovement = !!this.preserveCommandGaitFor;
    try {
      this.tree.halt();
    } finally {
      this.handingOverMovement = false;
    }
    this.event = null;
    const receipt: AnimalTaskReceipt = {
      ...request,
      target: request.target ? structuredClone(request.target) : undefined,
      status: skill.background ? "completed" : "accepted"
    };
    this.command = skill.background ? null : receipt;
    if (skill.background) this.backgroundSkill = request.skillId;
    this.receipts.set(request.requestId, receipt);
    if (this.receipts.size > 128) this.receipts.delete(this.receipts.keys().next().value!);
    this.paused = false;
    this.record(`request ${request.skillId}`);
    this.host.wake();
    return structuredClone(receipt);
  }

  /** Restart an admitted reaction; only explicitly registered physical interrupts may cancel a command. */
  notify(event: AnimalWorldEvent): boolean {
    const reaction = Object.prototype.hasOwnProperty.call(this.profile.reactions, event?.type)
      ? this.profile.reactions[event.type]
      : null;
    if (
      this.disposed ||
      this.paused ||
      !reaction ||
      (this.command && !reaction.interruptTask) ||
      typeof event.id !== "string" ||
      !event.id ||
      (event.source !== undefined &&
        (!Array.isArray(event.source) || event.source.length !== 2 || !event.source.every(Number.isFinite)))
    )
      return false;
    this.host.synchronize?.();
    if (this.command) {
      this.command.status = "cancelled";
      this.record(`interrupt ${this.command.skillId}`);
      this.command = null;
    }
    this.tree.halt();
    this.event = structuredClone(event);
    this.record(`event ${event.type}`);
    this.host.wake();
    return true;
  }

  /** Manual asset inspection suspends AI and explicitly cancels the outstanding task. */
  suspend(): void {
    this.host.synchronize?.();
    this.releasePreviousMovement();
    this.tree.halt();
    this.paused = true;
    this.event = null;
    if (this.command) this.command.status = "cancelled";
    this.command = null;
    this.branch = "manual";
    this.activeTarget = null;
  }

  /** Resume only from the shared scheduler; no recursive ticks or wall-clock timers. */
  tick(): void {
    if (this.disposed || this.paused) return;
    // Replace the movement intent atomically at the scheduled decision, not when
    // the request is queued. Otherwise repeated requests brake every motion step.
    this.releasePreviousMovement();
    if (this.tree.tick() !== "running") {
      this.tree.halt();
      this.host.wake();
    }
  }

  /** Recheck active world guards after resource/region facts change; explicit task priority is preserved. */
  worldChanged(): void {
    if (!this.disposed && !this.paused) this.host.wake();
  }

  /** Snapshot for UI and automated evidence; each caller receives detached values. */
  inspect() {
    return {
      branch: this.branch,
      slot: this.slot,
      fallback: this.fallback,
      animationPlays: this.animationPlays,
      activeTarget: this.activeTarget ? structuredClone(this.activeTarget) : null,
      reaction: this.event?.type ?? null,
      task: this.command ? structuredClone(this.command) : null,
      history: [...this.log]
    };
  }

  /** Query a submitted operation after completion or replacement. */
  receipt(requestId: string): AnimalTaskReceipt | undefined {
    const receipt = this.receipts.get(requestId);
    return receipt ? structuredClone(receipt) : undefined;
  }

  /** Cancel every active action and deadline; borrowed host resources remain owned by the host. */
  dispose(): void {
    this.suspend();
    this.disposed = true;
    this.receipts.clear();
  }

  private record(message: string): void {
    this.log.push(`${this.host.time.toFixed(2)} ${message}`);
    if (this.log.length > 16) this.log.shift();
  }

  private releasePreviousMovement(): void {
    const cancel = this.pendingMoveCancellation;
    this.pendingMoveCancellation = undefined;
    cancel?.();
  }

  private runRecipe(
    skillId: string,
    branch: string,
    owner: AnimalTaskReceipt | AnimalWorldEvent | null
  ): BehaviorAction {
    const skill = this.profile.skills[skillId];
    let nested: BehaviorTree<null>;
    let recovery: BehaviorAction | undefined;
    const actions = {
      animate: (_: null, params: Record<string, unknown>, wake: () => void) => this.animate(params, owner, wake),
      move: (_: null, params: Record<string, unknown>, wake: () => void) => this.move(params, owner, wake)
    };
    const recover = () =>
      this.medium === "air" && this.profile.landingMedium
        ? this.move(
            {
              slot: "fly",
              medium: "air",
              arrivalMedium: this.profile.landingMedium,
              resumeLanding: true,
              target: { query: "wander", params: { scope: "world" } },
              blockedReplanSeconds: 1
            },
            null,
            () => this.host.wake()
          )
        : this.animate({ slot: "idle" }, null, () => this.host.wake());
    const evaluate = (): BehaviorStatus => {
      if (recovery) {
        const recoveryStatus = recovery.update();
        if (recoveryStatus === "running") return "running";
        recovery.cancel();
        recovery = undefined;
        // A rejected landing is still airborne; do not resume ground autonomy.
        if (recoveryStatus === "failure" && this.medium === "air") {
          recovery = recover();
          recovery.start();
          this.host.wake();
          return "running";
        }
      }
      const status = nested.tick();
      if (status === "failure" && branch === "default") {
        nested.halt();
        recovery = recover();
        return recovery.start();
      }
      if (status === "running") return status;
      if (status === "success" && skill.repeat) {
        nested.halt();
        this.host.wake();
        return "running";
      }
      if (branch === "reaction") {
        this.event = null;
        this.record(`recover ${skillId}`);
      } else if (branch === "command") {
        const receipt = owner as AnimalTaskReceipt;
        receipt.status = status === "success" ? "completed" : "failed";
        if (status === "failure") receipt.reason = "target_or_action_unavailable";
        if (this.command === receipt) this.command = null;
        this.record(`${receipt.status} ${skillId}`);
      }
      return status;
    };
    return {
      start: () => {
        this.branch = `${branch}:${skillId}`;
        if (branch === "command") (owner as AnimalTaskReceipt).status = "running";
        this.record(`start ${this.branch}`);
        nested = new BehaviorTree(structuredClone(skill.tree), {
          context: null,
          actions,
          conditions: {
            targetAvailable: (_, params) => !!this.resolve(params, owner),
            inMedium: (_, params) => this.medium === params.medium
          },
          random: this.random,
          scheduleWake: () => this.host.wake()
        });
        // An idle command can interrupt a flight. Finish returning to support
        // before autonomous choices are allowed to select a terrestrial pose.
        if (branch === "default" && this.medium === "air" && this.profile.landingMedium) {
          recovery = recover();
          return recovery.start();
        }
        return evaluate();
      },
      update: evaluate,
      cancel: () => {
        recovery?.cancel();
        nested?.halt();
        this.record(`interrupt ${branch}:${skillId}`);
      }
    };
  }

  private animate(
    params: Record<string, unknown>,
    owner: AnimalTaskReceipt | AnimalWorldEvent | null,
    wake: () => void
  ): BehaviorAction {
    let cancel = () => {};
    let cancelDeadline = () => {};
    let done = false;
    let failed = false;
    let interaction: AnimalTargetQuery | null = null;
    let startDeadline = () => {};
    const release = () => {
      cancel();
      cancelDeadline();
      if (interaction) this.host.cancelInteraction?.(interaction);
      interaction = null;
    };
    return {
      start: () => {
        this.activeTarget = this.query(params, owner);
        if (params.target && !this.resolve(params, owner)) return "failure";
        const chosen = this.choose(String(params.slot));
        if (!chosen) return "failure";
        interaction = params.interaction ? this.query(params, owner) : null;
        const seconds = interaction ? this.host.beginInteraction?.(interaction) : undefined;
        let timing = false;
        const finish = () => {
          const query = this.query(params, owner);
          if (params.interaction && query && this.resolve(params, owner)) this.host.completeInteraction?.(query);
          else if (params.target && !this.resolve(params, owner)) failed = true;
          release();
          done = true;
          wake();
        };
        const cycle = () => {
          if (params.target && !this.resolve(params, owner)) {
            failed = true;
            done = true;
            release();
            wake();
            return;
          }
          const duration = this.play(chosen);
          cancel = this.animationEnd(duration, seconds === undefined ? finish : cycle);
        };
        startDeadline = () => {
          if (seconds === undefined || !interaction) return;
          if (this.host.interactionReady?.(interaction) === false) {
            cancelDeadline();
            timing = false;
            return;
          }
          if (timing) return;
          timing = true;
          cancelDeadline = this.host.schedule(seconds, finish);
        };
        // Animation loop boundaries must not reset a continuous interaction deadline.
        startDeadline();
        cycle();
        return "running";
      },
      update: () => {
        if (done) return failed ? "failure" : "success";
        if (params.target && !this.resolve(params, owner)) {
          release();
          return "failure";
        }
        startDeadline();
        return "running";
      },
      cancel: release
    };
  }

  private resolve(params: Record<string, unknown>, owner: AnimalTaskReceipt | AnimalWorldEvent | null) {
    const query = this.query(params, owner);
    if (!query || typeof query.query !== "string") return null;
    return this.host.resolveTarget(
      params.medium
        ? { ...query, params: { ...query.params, medium: params.medium, arrivalMedium: params.arrivalMedium } }
        : query,
      this.event,
      this.profile.movementSpeeds[String(params.slot)] * Number(params.speedMultiplier ?? 1) || undefined
    );
  }

  private query(
    params: Record<string, unknown>,
    owner: AnimalTaskReceipt | AnimalWorldEvent | null
  ): AnimalTargetQuery | null {
    return (
      (params.target === "request"
        ? (owner as AnimalTaskReceipt | null)?.target
        : (params.target as AnimalTargetQuery)) ?? null
    );
  }

  private move(
    params: Record<string, unknown>,
    owner: AnimalTaskReceipt | AnimalWorldEvent | null,
    wake: () => void
  ): BehaviorAction {
    let cancelMove = () => {};
    let cancelTimeout = () => {};
    let cancelCycle = () => {};
    let cancelBlocked = () => {};
    let cancelRetry = () => {};
    let cancelProgress = () => {};
    let progressDeadlineArmed = false;
    let needsTarget = false;
    let nextTargetAttempt = 0;
    let blockedReplanArmed = false;
    let status: BehaviorStatus = "running";
    let active = true;
    let cycleEnded = false;
    let waitingForTraffic = false;
    let movementStarted = false;
    let generation = 0;
    let target: readonly [number, number] | undefined;
    const requestedSlot = String(params.slot);
    const paceMultiplier = Number(params.speedMultiplier ?? 1);
    const arrivalMedium = params.arrivalMedium as "ground" | "water" | undefined;
    const flying = params.medium === "air";
    const targetQuery = this.query(params, owner)?.query;
    const progressSeconds =
      !flying && (targetQuery === "wander" || targetQuery === "flee")
        ? Number(params.replanBlockedSeconds ?? params.blockedReplanSeconds ?? 0)
        : 0;
    let moveSpeed = this.profile.movementSpeeds[requestedSlot] * paceMultiplier;
    const interactionReached = () =>
      !!params.arrivalTarget && !!this.resolve({ ...params, target: params.arrivalTarget }, owner);
    const resolveMovementTarget = (requirePreferred = false) => {
      const speed = this.profile.movementSpeeds[requestedSlot] * paceMultiplier;
      // Repeated queries still consume their random draws, but a rejected endpoint
      // needs only one path check during this synchronous search. Never retain it
      // across searches: movement or world changes can make that endpoint valid.
      const rejected: Array<readonly [number, number]> = [];
      const canReach = (candidate: readonly [number, number]) => {
        if (rejected.some((point) => point[0] === candidate[0] && point[1] === candidate[1])) return false;
        if (this.host.canMoveTo?.(candidate, speed, arrivalMedium) !== false) return true;
        // Hosts may reuse the candidate tuple for the next query.
        rejected.push([candidate[0], candidate[1]]);
        return false;
      };
      const retained = params.resumeLanding ? this.host.currentLanding?.() : undefined;
      if (retained && canReach(retained)) return retained;
      let fallback: readonly [number, number] | null = null;
      for (let attempt = 0; attempt < (arrivalMedium ? 12 : 8); attempt++) {
        const query = this.query(params, owner);
        const freeWander = query?.query === "wander" && params.medium !== "air";
        const fixedPoint = query && ["point", "position"].includes(query.query);
        // Small forward heading changes keep an ordinary wander leg out of the
        // body-sized reversal gait. Widen only after bounded forward attempts fail.
        const spread =
          query?.params?.headingSpread ??
          (freeWander
            ? attempt < 4
              ? Math.PI / 6
              : Math.PI * 2
            : attempt > 0 && !fixedPoint
              ? Math.PI * 2
              : undefined);
        const candidate = this.resolve(
          query && spread !== undefined
            ? { ...params, target: { ...query, params: { ...query.params, headingSpread: spread } } }
            : params,
          owner
        );
        if (!candidate) {
          if (!freeWander || query?.params?.headingSpread !== undefined || attempt >= 4)
            return requirePreferred ? null : fallback;
          continue;
        }
        if (canReach(candidate)) {
          if (arrivalMedium || params.arrivalTarget || this.host.prefersMoveTo?.(candidate, speed) !== false)
            return candidate;
          fallback ??= candidate;
        }
        // An explicit position is fixed; repeated queries cannot improve it.
        if (params.target === "request" && ["point", "position"].includes(this.query(params, owner)?.query ?? ""))
          break;
      }
      return requirePreferred ? null : fallback;
    };
    const slowerSlot = params.preserveGait ? undefined : this.profile.movementFallbacks?.[requestedSlot];
    const fastSpeed = this.profile.movementSpeeds[requestedSlot];
    let paceSlot = requestedSlot,
      playingPaceSlot = requestedSlot;
    const updatePace = (notify = true) => {
      if (this.movementEffort === undefined) return;
      if (slowerSlot) {
        const next =
          paceSlot === requestedSlot
            ? this.movementEffort < fastSpeed * 0.55
              ? slowerSlot
              : requestedSlot
            : this.movementEffort > fastSpeed * 0.75
              ? requestedSlot
              : slowerSlot;
        if (next !== paceSlot) {
          paceSlot = next;
          if (notify) wake();
        }
      }
      if (!(progressSeconds > 0) || !active) return;
      // A movable but obsolete goal can cause endless body-sized stepping turns.
      // Arm on a speed threshold crossing; ordinary movement owns no extra deadline.
      if (waitingForTraffic || this.movementEffort >= moveSpeed * (progressDeadlineArmed ? 0.5 : 0.3)) {
        if (progressDeadlineArmed) {
          cancelProgress();
          progressDeadlineArmed = false;
        }
      } else if (!progressDeadlineArmed) {
        progressDeadlineArmed = true;
        cancelProgress = this.host.schedule(progressSeconds, () => {
          progressDeadlineArmed = false;
          if (!active || waitingForTraffic) return;
          // A route that already failed to make progress must not restart another
          // congested fallback. Yield until the next autonomous choice instead.
          const alternative = resolveMovementTarget(true);
          if (!alternative) {
            finish(false);
            return;
          }
          target = alternative;
          this.record(`replan ${targetQuery} (low progress)`);
          startMovement();
          updatePace(false);
        });
      }
    };
    const releasePace = () => {
      if (this.paceChanged === updatePace) this.paceChanged = undefined;
    };
    const finish = (success: boolean) => {
      if (!active) return;
      active = false;
      releasePace();
      status = success ? "success" : "failure";
      cancelMove();
      cancelTimeout();
      cancelCycle();
      cancelBlocked();
      cancelRetry();
      cancelProgress();
      if (success && arrivalMedium) this.medium = arrivalMedium;
      const idle = this.choose("idle");
      if (idle) this.play(idle);
      wake();
    };
    // Route recovery owns a bounded wake, not the animation clock. Even an exhausted
    // search must leave the current one-shot and its completion callback alive.
    const retry = () => {
      needsTarget = true;
      cancelRetry();
      cancelRetry = this.host.schedule(Math.max(0, nextTargetAttempt - this.host.time), wake);
    };
    const startMovement = () => {
      if (!target || needsTarget || !active) return;
      movementStarted = true;
      const currentGeneration = ++generation;
      cancelMove();
      cancelMove = this.host.moveTo(
        target,
        moveSpeed,
        (success) => {
          if (!active || generation !== currentGeneration) return;
          if (success && params.arrivalTarget && !interactionReached()) {
            // A route waypoint is not arrival at the interaction. Yield before querying
            // the next leg, including hosts that complete zero-distance moves inline.
            generation++;
            cancelMove();
            nextTargetAttempt = Math.max(nextTargetAttempt, this.host.time + 0.25);
            retry();
          } else if (!success && flying) retry();
          else finish(success);
        },
        arrivalMedium
      );
      if (!active || needsTarget) cancelMove();
    };
    const replan = () => {
      if (this.host.time < nextTargetAttempt) return;
      nextTargetAttempt = this.host.time + 0.25;
      cancelRetry();
      const alternative = resolveMovementTarget();
      if (alternative) {
        target = alternative;
        needsTarget = false;
        startMovement();
      } else if (params.arrivalTarget && !flying) finish(false);
      else retry();
    };
    // A goal can outlive a clip. Each completed clip returns to the tree action for
    // a fresh weighted choice; the renderer never loops or chooses the next clip.
    const nextCycle = (): BehaviorStatus => {
      if (interactionReached()) {
        finish(true);
        return status;
      }
      const movementSlot = String(params.slot);
      const gait = this.choose(movementSlot);
      if (!gait) {
        finish(false);
        return status;
      }
      moveSpeed = (gait.speed ?? this.profile.movementSpeeds[this.slot]) * paceMultiplier;
      waitingForTraffic = !flying && (this.host.movementBlocked?.() ?? false);
      if (waitingForTraffic) {
        cancelProgress();
        progressDeadlineArmed = false;
      }
      const replanSeconds = Number(params.replanBlockedSeconds ?? 0);
      if (waitingForTraffic && !blockedReplanArmed && (replanSeconds > 0 || Number(params.blockedReplanSeconds) > 0)) {
        blockedReplanArmed = true;
        // Autonomous goals may yield a congested destination; semantic escape
        // may replan within the same task. Exact-position commands retain their goal.
        cancelBlocked = this.host.schedule(replanSeconds || Number(params.blockedReplanSeconds), () => {
          if (!active) return;
          if (!replanSeconds) {
            finish(!arrivalMedium && (!params.arrivalTarget || interactionReached()));
            return;
          }
          // Semantic escape retains its command/priority while choosing another
          // reachable escape point. Exact-position commands never enable this policy.
          const alternative = resolveMovementTarget();
          if (alternative) {
            target = alternative;
            startMovement();
          }
          blockedReplanArmed = false;
          wake();
        });
      } else if (!waitingForTraffic) {
        cancelBlocked();
        blockedReplanArmed = false;
      }
      playingPaceSlot = paceSlot;
      const choice = waitingForTraffic
        ? (this.choose("idle") ?? gait)
        : paceSlot !== requestedSlot
          ? (this.choose(paceSlot) ?? gait)
          : gait;
      if (!choice) {
        finish(false);
        return status;
      }
      cycleEnded = false;
      const poseSpeed = choice.speed ?? this.profile.movementSpeeds[this.slot];
      const duration = this.play(
        choice,
        waitingForTraffic ? undefined : poseSpeed * paceMultiplier,
        waitingForTraffic ? 1 : paceMultiplier,
        !waitingForTraffic && params.urgent === true
      );
      // Waiting clips do not own or replace the accepted movement task. In particular,
      // a repeated idle must not discard a deferred safe stop during a crossing.
      if (!waitingForTraffic || !movementStarted) startMovement();
      if (active)
        cancelCycle = this.animationEnd(duration, () => {
          cycleEnded = true;
          // Continuing the same running move is an action-local completion,
          // not a new tree traversal. Chain it outside Animator callbacks so
          // remaining simulation substeps do not hold the last airborne pose.
          // Terminal/traffic decisions still use the bounded tree wake queue.
          if (!waitingForTraffic) {
            if (params.guardTarget) {
              const currentTarget = this.resolve(params, owner);
              if (!currentTarget) {
                finish(false);
                return;
              }
              target = currentTarget;
            }
            nextCycle();
          } else wake();
        });
      else cancelMove();
      return status;
    };
    return {
      start: () => {
        this.activeTarget = this.query(params, owner);
        if (interactionReached()) {
          finish(true);
          return status;
        }
        const resolved = resolveMovementTarget();
        if (!resolved && !(flying && params.resumeLanding && this.medium === "air")) {
          active = false;
          return (status = "failure");
        }
        target = resolved ?? undefined;
        if (!flying && !params.arrivalTarget && target && this.host.isAtTarget?.(target, arrivalMedium)) {
          finish(true);
          return status;
        }
        if (!target) {
          nextTargetAttempt = this.host.time + 0.25;
          retry();
        }
        if (slowerSlot || progressSeconds > 0) {
          this.paceChanged = updatePace;
          updatePace(false);
        }
        nextCycle();
        // Flights and interaction approaches keep their bound goal until arrival or invalidation.
        const timeout = params.timeoutSeconds ?? (params.medium === "air" || params.arrivalTarget ? undefined : 60);
        if (active && timeout !== undefined) cancelTimeout = this.host.schedule(Number(timeout), () => finish(false));
        return status;
      },
      update: () => {
        if (active && interactionReached()) {
          finish(true);
          return status;
        }
        if (active && (needsTarget || (flying && (this.host.movementNeedsReplan?.() || this.host.movementBlocked?.()))))
          replan();
        if (active && params.guardTarget) {
          const currentTarget = this.resolve(params, owner);
          if (!currentTarget) finish(false);
          else if (target && (currentTarget[0] !== target[0] || currentTarget[1] !== target[1])) {
            target = currentTarget;
            startMovement();
          }
        }
        if (active && !waitingForTraffic && paceSlot !== playingPaceSlot) {
          cancelCycle();
          return nextCycle();
        }
        // React once to a solver-reported traffic edge, never to a zero-distance
        // animation frame. Keep the goal while waiting; a new command can interrupt it.
        if (active && !flying && waitingForTraffic !== (this.host.movementBlocked?.() ?? false)) {
          cancelCycle();
          return nextCycle();
        }
        if (active && cycleEnded) return nextCycle();
        return status;
      },
      cancel: () => {
        active = false;
        releasePace();
        if (this.handingOverMovement) this.pendingMoveCancellation = cancelMove;
        else cancelMove();
        cancelTimeout();
        cancelCycle();
        cancelBlocked();
        cancelRetry();
        cancelProgress();
      }
    };
  }

  private play(choice: AnimalAnimationChoice, locomotionSpeed?: number, paceMultiplier = 1, urgent = false): number {
    this.animationPlays++;
    this.record(`play ${this.slot} (${choice.clip})${this.activeTarget ? ` → ${this.activeTarget.query}` : ""}`);
    this.medium = choice.medium ?? "ground";
    const preservePhase =
      this.preserveCommandGaitFor !== undefined &&
      this.command?.requestId === this.preserveCommandGaitFor &&
      (locomotionSpeed ?? 0) > 0;
    this.preserveCommandGaitFor = undefined;
    return this.host.play(choice.clip, locomotionSpeed, this.medium, paceMultiplier, urgent, preservePhase);
  }

  private animationEnd(duration: number, callback: () => void): () => void {
    return this.host.onAnimationEnd?.(callback) ?? this.host.schedule(duration, callback);
  }

  private choose(requested: string): AnimalAnimationChoice | undefined {
    let slot = requested;
    const seen = new Set<string>();
    let choices: AnimalAnimationChoice[];
    while (
      !(choices =
        this.profile.animationSlots[slot]?.filter(
          (choice) =>
            choice.weight > 0 &&
            (this.medium !== "air" || choice.medium === "air") &&
            (slot !== "idle" || (choice.medium ?? "ground") === this.medium) &&
            (!choice.when || !!this.host.resolveTarget(choice.when, this.event))
        ) ?? []).length
    ) {
      if (seen.has(slot)) return undefined;
      seen.add(slot);
      const next = this.profile.animationFallbacks?.[slot];
      if (!next) return undefined;
      slot = next;
    }
    let value = this.random() * choices.reduce((sum, choice) => sum + choice.weight, 0);
    const selected = choices.find((choice) => (value -= choice.weight) < 0) ?? choices[choices.length - 1];
    this.slot = slot;
    this.fallback = slot === requested ? "" : `${requested} → ${slot}`;
    return selected;
  }
}

/** Reject malformed recipes, missing slots, fallback cycles and invalid weights before spawning. */
export function validateAnimalTaskProfile(profile: AnimalTaskProfile, clips?: ReadonlySet<string>): void {
  if (
    !profile?.skills?.[profile.defaultSkill] ||
    !profile.animationSlots ||
    !profile.movementSpeeds ||
    !profile.reactions
  )
    throw new Error("Invalid animal task profile");
  const resolveSlot = (start: string): string => {
    const seen = new Set<string>();
    let slot = start;
    while (!profile.animationSlots[slot]?.some((choice) => choice.weight > 0)) {
      if (seen.has(slot)) throw new Error(`Animation fallback cycle: ${start}`);
      seen.add(slot);
      slot = profile.animationFallbacks?.[slot] ?? "";
      if (!slot) throw new Error(`Missing animation slot: ${start}`);
    }
    return slot;
  };
  for (const [slot, choices] of Object.entries(profile.animationSlots)) {
    if (!Array.isArray(choices) || !choices.length) throw new Error(`Empty animation slot: ${slot}`);
    for (const choice of choices)
      if (
        !choice.clip ||
        !Number.isFinite(choice.weight) ||
        choice.weight < 0 ||
        (clips && !clips.has(choice.clip)) ||
        "seconds" in choice ||
        (choice.when !== undefined && (typeof choice.when.query !== "string" || !choice.when.query)) ||
        (choice.speed !== undefined && (!Number.isFinite(choice.speed) || choice.speed <= 0)) ||
        (choice.medium !== undefined && !["ground", "water", "air"].includes(choice.medium))
      )
        throw new Error(`Invalid weighted animation: ${slot}`);
    if (!Number.isFinite(choices.reduce((sum, choice) => sum + choice.weight, 0)))
      throw new Error(`Invalid total animation weight: ${slot}`);
    resolveSlot(slot);
  }
  for (const slot of Object.keys(profile.animationFallbacks ?? {})) resolveSlot(slot);
  for (const speed of Object.values(profile.movementSpeeds))
    if (!Number.isFinite(speed) || speed <= 0) throw new Error("Invalid movement speed");
  for (const [fast, slow] of Object.entries(profile.movementFallbacks ?? {})) {
    resolveSlot(fast);
    resolveSlot(slow);
    if (!(profile.movementSpeeds[fast] > profile.movementSpeeds[slow]))
      throw new Error("Movement fallback requires a compatible slower calibrated gait");
  }
  const visit = (node: BehaviorNode): void => {
    if (node.type === "action") {
      const params = node.params ?? {};
      const slot = resolveSlot(String(params.slot));
      if (params.seconds !== undefined) throw new Error("Animation phases finish on clip completion; remove seconds");
      if (params.guardTarget !== undefined && typeof params.guardTarget !== "boolean")
        throw new Error("Invalid target guard");
      if (
        params.interaction !== undefined &&
        (typeof params.interaction !== "boolean" || node.name !== "animate" || !params.target)
      )
        throw new Error("Invalid animation interaction");
      if (params.preserveGait !== undefined && (typeof params.preserveGait !== "boolean" || node.name !== "move"))
        throw new Error("Invalid movement gait policy");
      if (params.urgent !== undefined && (typeof params.urgent !== "boolean" || node.name !== "move"))
        throw new Error("Invalid movement response");
      if (params.arrivalMedium !== undefined && !["ground", "water"].includes(String(params.arrivalMedium)))
        throw new Error("Invalid arrival medium");
      if (
        params.speedMultiplier !== undefined &&
        (!Number.isFinite(params.speedMultiplier) || Number(params.speedMultiplier) <= 0)
      )
        throw new Error("Invalid movement pace");
      if (
        params.replanBlockedSeconds !== undefined &&
        (!Number.isFinite(params.replanBlockedSeconds) || Number(params.replanBlockedSeconds) <= 0)
      )
        throw new Error("Invalid blocked movement replanning interval");
      if (
        params.arrivalTarget !== undefined &&
        (node.name !== "move" ||
          !params.arrivalTarget ||
          typeof (params.arrivalTarget as AnimalTargetQuery).query !== "string")
      )
        throw new Error("Invalid interaction arrival target");
      if (
        node.name === "move" &&
        (!profile.movementSpeeds[slot] ||
          !params.target ||
          (params.target !== "request" && typeof (params.target as AnimalTargetQuery).query !== "string") ||
          (params.timeoutSeconds !== undefined &&
            (!Number.isFinite(params.timeoutSeconds) || Number(params.timeoutSeconds) <= 0)) ||
          params.cycles !== undefined)
      )
        throw new Error("Invalid movement recipe");
    } else if (node.type === "condition" && node.name === "inMedium") {
      if (!["ground", "water", "air"].includes(String(node.params?.medium)))
        throw new Error("Invalid medium condition");
    } else if (node.type === "weightedRandom") node.children.forEach((child) => visit(child.node));
    else if (node.type === "selector" || node.type === "sequence") node.children.forEach(visit);
  };
  for (const skill of Object.values(profile.skills)) {
    if (
      !skill ||
      typeof skill.label !== "string" ||
      !skill.label ||
      (skill.movementIntent !== undefined && !["slow", "fast"].includes(skill.movementIntent)) ||
      (skill.repeat !== undefined && typeof skill.repeat !== "boolean") ||
      (skill.background !== undefined && (typeof skill.background !== "boolean" || (skill.background && !skill.repeat)))
    )
      throw new Error("Invalid animal skill");
    new BehaviorTree(skill.tree, {
      context: null,
      actions: { animate: () => null!, move: () => null! },
      conditions: { targetAvailable: () => true, inMedium: () => true }
    });
    visit(skill.tree);
  }
  for (const reaction of Object.values(profile.reactions))
    if (
      !profile.skills[reaction.skillId] ||
      profile.skills[reaction.skillId].repeat ||
      (reaction.interruptTask !== undefined && typeof reaction.interruptTask !== "boolean")
    )
      throw new Error("Invalid animal reaction");
}
