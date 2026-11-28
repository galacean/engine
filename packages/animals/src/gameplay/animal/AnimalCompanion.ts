import {
  AnimationClip,
  Camera,
  Animator,
  AnimatorState,
  AnimatorController,
  AnimatorControllerLayer,
  Entity,
  GLTFResource,
  SkinnedMeshRenderer,
  Signal,
  Vector3,
  WrapMode
} from "@galacean/engine";
import { BehaviorTree, type BehaviorStatus, type BehaviorAction, type BehaviorNode } from "../behavior/BehaviorTree";
import { MountDissolveEffect } from "../mount/MountDissolveEffect";
import { AnimalAnimationBridge, AnimalStateEvents, createAnimalAnimationClip } from "./AnimalAnimationBridge";
import { stepGroundMountRide, type GroundMountRideStep } from "../mount/GroundMountRideMotion";
import { isAnimalCommand } from "./AnimalCommands";
import {
  scaleAnimalProfile,
  type AnimalAnimationState as AnimalState,
  type AnimalScaledProfile,
  type AnimalSpeciesDocument
} from "./AnimalSpeciesAsset";
import { AnimalModelLod } from "./AnimalLod";
import type { AnimalAgent, AnimalSystem } from "./AnimalSystem";
import type {
  AnimalCommand,
  AnimalEvent,
  AnimalGround,
  AnimalHost,
  AnimalReceipt,
  AnimalRideInput,
  AnimalSnapshot
} from "./AnimalTypes";

const loopStates = new Set<AnimalState>([
  "idle",
  "idleB",
  "idleC",
  "falling",
  "walk",
  "run",
  "walkLeft",
  "walkRight",
  "runLeft",
  "runRight",
  "turn"
]);
const walkingStates = new Set<AnimalState>(["walk", "walkLeft", "walkRight", "turn"]);
const runningStates = new Set<AnimalState>(["run", "runLeft", "runRight"]);
const ridingStates = new Set<AnimalState>(["idle", "idleB", "idleC", ...walkingStates, ...runningStates]);
interface QueuedAnimation {
  kind: "enter" | "marker";
  state: AnimalState;
  marker?: string;
  token: number;
}
interface Task {
  kind: string;
  params: Record<string, unknown>;
  status: BehaviorStatus;
  started: number;
  deadline: number;
  cancelDeadline?: () => void;
}

/** Mount capabilities executed by a configurable behavior tree and the native Animator. */
export class AnimalCompanion implements AnimalAgent {
  /** Events carry the command identity that owns the current behavior. */
  readonly events = new Signal<[AnimalEvent]>();
  /** Accepted ground travel in metres and current speed in metres per second. */
  readonly groundedTravel = new Signal<[distance: number, speed: number]>();
  private _model!: Entity;
  private _lod?: AnimalModelLod;
  private _saddle!: Entity;
  private _profile!: AnimalScaledProfile;
  private _cancelPerception?: () => void;
  private _rootBone!: Entity;
  private readonly _rootOrigin = new Vector3();
  private readonly _rootMotionSample = new Vector3();
  private _animator!: Animator;
  private _controller!: AnimatorController;
  private readonly _ownedClips: AnimationClip[] = [];
  private _tree!: BehaviorTree<AnimalCompanion>;
  private _task: Task | null = null;
  private _command: AnimalCommand | null = null;
  private _pendingCommand: AnimalCommand | null = null;
  private _needsDecision = true;
  private get _dirty(): boolean {
    return this._needsDecision;
  }
  private set _dirty(value: boolean) {
    this._needsDecision = value;
    if (value) this._system.requestWake(this);
  }
  private _driving = false;
  private _entrancePending = false;
  private _failure = "";
  private _state: AnimalState = "idle";
  private _pendingState: AnimalState | null = null;
  private _present = false;
  private _mounted = false;
  private _disposed = false;
  private _active = true;
  private _behavior: AnimalSnapshot["behavior"] = "free";
  private _temperament: AnimalSnapshot["temperament"] = "cheeky";
  private _gait: AnimalSnapshot["gait"] = "walk";
  private _operation: AnimalReceipt | null = null;
  private readonly _receipts = new Map<string, AnimalReceipt>();
  private _token = 0;
  private readonly _stateTokens = new Map<AnimalState, number>();
  private readonly _queue: QueuedAnimation[] = [];
  private _stateStarted = 0;
  private _animationPhase = 0;
  private _animationChangeFrame = -1;
  private _yaw = 0;
  private _speed = 0;
  private readonly _walkStates: AnimatorState[] = [];
  private readonly _rideStep: GroundMountRideStep = { speed: 0, distance: 0, yawDelta: 0 };
  private _stopSpeed = 0;
  private _rideAnimationTurn = 0;
  private _rideAnimationCandidate = 0;
  private _rideAnimationCandidateSeconds = 0;
  private _transferringControl = false;
  private _vanishStarted: number | null = null;
  private _dissolve?: MountDissolveEffect;
  private _mountLockedUntil = 0;
  private _requireReentry = false;
  private _wasNear = false;
  private _random = 1729;
  private _repathAt = 0;
  private _route: Vector3[] = [];
  private _waypoint = 0;
  private _grassAvailable = false;
  private readonly _grassTarget = new Vector3();
  private _ground: AnimalGround = { height: 0, grass: false };
  private readonly _ride: AnimalRideInput = { forward: 0, turn: 0, dismount: false };
  private readonly _position = new Vector3();
  private readonly _player = new Vector3();
  private readonly _forward = new Vector3();
  private readonly _next = new Vector3();
  private readonly _target = new Vector3();
  private readonly _direction = new Vector3();
  private readonly _counts = { decisions: 0, groundQueries: 0, mounts: 0 };
  /** Instance state belongs to the animal Entity; shared assets and the clock remain borrowed. */
  constructor(
    readonly entity: Entity,
    private readonly _host: AnimalHost,
    private readonly _system: AnimalSystem,
    species: AnimalSpeciesDocument,
    scale: number,
    seed: number
  ) {
    this._profile = scaleAnimalProfile(species.companion!.profile, scale);
    this._random = seed | 0 || 1;
  }

  private get engine() {
    return this.entity.engine;
  }

  /** Bind an already resolved model; this runtime contains no model URLs or species-name branches. */
  async initialize(resource: GLTFResource, species: AnimalSpeciesDocument): Promise<void> {
    const profile = this._profile;
    this._model = resource.instantiateSceneRoot();
    this.entity.addChild(this._model);
    this._model.transform.setScale(profile.modelScale, profile.modelScale, profile.modelScale);
    this._model.transform.setPosition(0, profile.modelGroundOffset, 0);
    const renderers: SkinnedMeshRenderer[] = [];
    this._model.getComponentsIncludeChildren(SkinnedMeshRenderer, renderers);
    for (const renderer of renderers) {
      renderer.localBounds.min.set(...profile.skinnedBounds.min);
      renderer.localBounds.max.set(...profile.skinnedBounds.max);
    }
    if (profile.mountable) {
      const bone = this._model.findByName(profile.saddleBone!);
      if (!bone) throw new Error(`Animal seat bone is missing: ${profile.saddleBone}`);
      this._saddle = bone.createChild("Animal seat");
      this._saddle.transform.setPosition(...profile.saddleLocal!);
    }
    const animators: Animator[] = [];
    this._model.getComponentsIncludeChildren(Animator, animators);
    if (animators.length !== 1) throw new Error(`Animal requires one Animator; found ${animators.length}`);
    this._animator = animators[0];
    this._buildController(resource.animations ?? []);
    if (species.companion!.dissolve) {
      this._dissolve = await MountDissolveEffect.create(this._model, this.entity, species.companion!.dissolve);
      if (this.entity.destroyed || this._disposed) throw new Error("Animal destroyed during effect loading");
    }
    if (profile.rootMotion) {
      this._rootBone = this._model.findByName(profile.rootMotion.bone)!;
      if (!this._rootBone) throw new Error(`Animal root-motion bone is missing: ${profile.rootMotion.bone}`);
      this._rootOrigin.copyFrom(this._rootBone.transform.position);
    }
    if (species.lod) this._lod = new AnimalModelLod(this._model, species.lod);
    this._model.isActive = false;
    this._buildBehavior(species.companion!.behavior);
    this._host.playerMoved.on(this._onPlayerMoved);
    this._system.register(this);
  }

  /** Resume decisions only through the scene's budgeted queue. */
  evaluateBehavior(): void {
    if (this._dirty) this._drive();
    this._system.setMoving(
      this,
      this._present &&
        (this._mounted ||
          (this._task?.status === "running" &&
            ["land", "move", "remove", "reveal", "dismount"].includes(this._task.kind)))
    );
  }

  /** Suspend perception with the owning component; task deadlines retain scene-time semantics. */
  setActive(active: boolean): void {
    this._active = active;
    if (this._animator) this._animator.enabled = active;
    this._cancelPerception?.();
    this._cancelPerception = undefined;
    if (active && this._present && !this._disposed) {
      this._dirty = true;
      this._schedulePerception();
    }
  }

  /** Resolve model geometry independently of companion behavior and mounted input. */
  updateCameraLod(camera: Camera): void {
    if (!this._disposed && this._present) this._lod?.updateCamera(camera);
  }

  /** Animated seat anchor calibrated to the saddle surface, independently of any camera or rider model. */
  get saddle(): Entity {
    return this._saddle;
  }

  /** Current native Animator clip, rather than a requested transition destination. */
  get currentAnimation(): string {
    return this._present ? (this._animator.getCurrentAnimatorState(0)?.clip?.name ?? "—") : "—";
  }

  /** Submit a validated intent; duplicate IDs never restart a behavior. */
  execute(command: AnimalCommand): AnimalReceipt {
    if (!isAnimalCommand(command) || this._disposed || (command.action === "dismount" && !this._profile.mountable))
      return { requestId: command?.requestId ?? "", status: "rejected", detail: "" };
    const previous = this._receipts.get(command.requestId);
    if (previous) return { ...previous };
    const receipt: AnimalReceipt = { requestId: command.requestId, status: "accepted", detail: "" };
    this._receipts.set(command.requestId, receipt);
    if (this._receipts.size > 96) this._receipts.delete(this._receipts.keys().next().value!);
    if (command.action === "gait" || command.action === "temperament" || command.action === "behavior") {
      if (command.action === "gait") this._gait = command.gait;
      if (command.action === "temperament") this._temperament = command.temperament;
      if (command.action === "behavior") {
        this._behavior = command.behavior;
        if (!this._command && !this._safeTransition()) this._tree.halt();
      }
      receipt.status = "completed";
      receipt.detail = "";
      this._dirty = true;
      return { ...receipt };
    }
    if (command.action === "come" && this._mounted) {
      receipt.status = "completed";
      receipt.detail = "";
      this.events.invoke({
        type: "completed",
        detail: receipt.detail,
        requestId: receipt.requestId,
        actionId: this._token
      });
      if (this._operation?.status !== "accepted") this._operation = receipt;
      return { ...receipt };
    }
    if (this._pendingCommand) {
      const pending = this._receipts.get(this._pendingCommand.requestId)!;
      pending.status = "cancelled";
      pending.detail = "";
    }
    this._cancelOperation();
    this._pendingCommand = command;
    this._dirty = true;
    return { ...receipt };
  }

  /** Whether this mount currently owns the rider. */
  get mounted(): boolean {
    return this._mounted;
  }

  /** Copy mount state and operation status for UI and command adapters. */
  inspect(): AnimalSnapshot {
    return {
      present: this._present,
      mounted: this._mounted,
      state: !this._present ? "absent" : this._vanishStarted !== null ? "vanishing" : this._state,
      position: [this._position.x, this._position.y, this._position.z],
      yaw: this._yaw,
      behavior: this._behavior,
      temperament: this._temperament,
      gait: this._gait,
      onGrass: this._ground.grass,
      operation: this._operation ? { ...this._operation } : null,
      counters: { ...this._counts }
    };
  }

  /** Integrate only active motion; behavior decisions wake on events and bounded perception. */
  advanceMotion(dt: number): void {
    if (this._disposed || !this._present || dt <= 0) return;
    const elapsed = Math.min(dt, 0.1);
    const startX = this._position.x,
      startZ = this._position.z;
    const task = this._task;
    if (this._mounted) {
      this._updateRide(elapsed, task?.kind === "dismount");
    } else if (task?.status === "running") {
      if (task.kind === "reveal") {
        if (!this._dissolve || this._dissolve.settled) this._finishTask();
      } else if (task.kind === "land") {
        const t = Math.min(1, (this._system.time - task.started) / this._profile.dropSeconds);
        this._position.y = this._ground.height + this._profile.skyHeight * (1 - t * t);
        this._applyTransform();
        if (t === 1) {
          this._emit("landed", "");
          this._finishTask();
        }
      } else if (task.kind === "move") this._updateMove(elapsed);
      else if (task.kind === "remove") {
        if (!this._dissolve || this._dissolve.finished) {
          this._present = false;
          this._model.isActive = false;
          this._vanishStarted = null;
          this._emit("dismissed", "");
          this._finishTask();
        }
      }
    }
    const distance = Math.hypot(this._position.x - startX, this._position.z - startZ);
    const speed = distance / dt;
    if (distance > 0 && (walkingStates.has(this._state) || runningStates.has(this._state))) {
      this.groundedTravel.invoke(distance, speed);
    }
    const walkRate = speed / this._profile.walkClipSpeed;
    // A zero destination speed stalls native crossFade completion when input is released.
    for (const state of this._walkStates) state.speed = walkRate > 0.01 ? Math.min(walkRate, 3) : 1;
    if (task?.kind === "dismount" && !this._mounted && !this._host.isRiderTransitioning?.()) this._finishTask();
  }

  /** Consume native animation events outside Animator evaluation, then advance the tree. */
  lateUpdate(deltaTime: number): void {
    if (this._disposed) return;
    this._advanceAnimationPhase(deltaTime);
    // Optional launch clips can contribute horizontal root motion to ground-following movement.
    if (this._present && this._rootBone) {
      const root = this._rootBone.transform.position;
      if (this._task?.kind === "animate" && this._task.params.state === "launch" && this._task.status === "running") {
        const axes = this._profile.rootMotion!.horizontalAxes;
        this._direction.set(0, 0, 0);
        for (const axis of axes) this._direction[axis] = root[axis] - this._rootMotionSample[axis];
        this._rootMotionSample.copyFrom(root);
        Vector3.transformNormal(this._direction, this._rootBone.parent!.transform.worldMatrix, this._direction);
        this._next.set(this._position.x + this._direction.x, this._position.y, this._position.z + this._direction.z);
        if (this._moveTo(this._next)) this._applyTransform();
      }
      for (const axis of this._profile.rootMotion!.horizontalAxes) root[axis] = this._rootOrigin[axis];
      this._rootBone.transform.setPosition(root.x, root.y, root.z);
    }
    for (const event of this._queue) {
      if (!this._present || event.token !== this._token || event.state !== this._state) continue;
      if (event.kind === "marker" && event.marker) this._marker(event.marker);
    }
    this._queue.length = 0;
    if (this._pendingState && this._animator.getCurrentAnimatorState(0)?.name === this._state) {
      const state = this._pendingState;
      this._pendingState = null;
      this._change(state);
    }
    if (this._mounted) this._host.updateRiderPose?.(deltaTime);
  }

  /** Release subscriptions and any running capability. */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._cancelPerception?.();
    this._system.remove(this);
    this._dissolve?.entity.destroy();
    this._tree?.halt();
    this._host?.playerMoved.off(this._onPlayerMoved);
    if (this._mounted) this._host.setRiding(false, this._position, this._yaw);
    this._cancelOperation();
    if (this._pendingCommand) {
      const receipt = this._receipts.get(this._pendingCommand.requestId)!;
      receipt.status = "cancelled";
      receipt.detail = "";
    }
    this._pendingCommand = null;
    this._command = null;
    this._present = false;
    this.events.removeAll();
    this.groundedTravel.removeAll();
    this._animator?.destroy();
    this._controller?.destroy();
    for (const clip of this._ownedClips) clip.destroy();
    this._ownedClips.length = 0;
    this._model?.destroy();
  }

  private _buildBehavior(behavior: BehaviorNode): void {
    const actions: Record<string, (context: AnimalCompanion, params: Record<string, unknown>) => BehaviorAction> = {};
    for (const name of [
      "enter",
      "reveal",
      "land",
      "animate",
      "move",
      "dismount",
      "remove",
      "ride",
      "wait",
      "complete",
      "reject"
    ]) {
      actions[name] = (_context, params) => {
        let owned: Task | null = null;
        return {
          start: () => {
            owned = {
              kind: name,
              params,
              status: "running",
              started: this._system.time,
              deadline: Infinity
            };
            this._task = owned;
            const status = this._startTask(owned);
            if (status === "running" && Number.isFinite(owned.deadline)) {
              const task = owned;
              task.cancelDeadline = this._system.schedule(Math.max(0, task.deadline - this._system.time), () => {
                if (this._task === task) this._finishTask("failure", "task_timeout");
              });
            }
            return status;
          },
          update: () => owned!.status,
          cancel: () => {
            if (this._task !== owned) return;
            owned?.cancelDeadline?.();
            this._task = null;
            if (!this._mounted) this._speed = 0;
            this._token++;
            this._pendingState = null;
            this._queue.length = 0;
          }
        };
      };
    }
    this._tree = new BehaviorTree<AnimalCompanion>(behavior, {
      context: this,
      actions,
      scheduleWake: () => {
        this._dirty = true;
      },
      random: () => this._nextRandom(),
      conditions: {
        command: (_context, params) => this._command?.action === params.name,
        present: () => this._present,
        absent: () => !this._present,
        mounted: () => this._mounted,
        groundEntry: () => this._command?.action === "summon" && this._command.entry === "ground",
        stay: () => this._behavior === "stay",
        followFar: () => this._behavior === "follow" && this._playerDistance() > 5,
        onGrass: () => this._sample(this._position) && this._ground.grass,
        grassAvailable: () => this._grassAvailable
      }
    });
  }

  private _drive(): void {
    if (this._driving || this._disposed) return;
    this._driving = true;
    this._dirty = false;
    if (this._pendingCommand && !this._safeTransition()) {
      this._cancelOperation();
      this._tree.halt();
      this._command = this._pendingCommand;
      this._pendingCommand = null;
      this._operation = this._receipts.get(this._command.requestId)!;
      if (this._command.action === "come") {
        this._requireReentry = false;
        this._mountLockedUntil = 0;
      }
      this._failure = "";
      if (!this._mounted) this._speed = 0;
      this._model.transform.setScale(this._profile.modelScale, this._profile.modelScale, this._profile.modelScale);
      if (this._vanishStarted !== null && this._present) this._dissolve?.play(true, 0.35);
      this._vanishStarted = null;
      this._emit("accepted", this._command.action);
    }
    const status = this._tree.tick();
    if (status !== "running") {
      this._tree.halt();
      this._task = null;
      this._dirty = true;
      this._considerMount(false);
    }
    this._driving = false;
  }

  private _safeTransition(): boolean {
    return (
      this._entrancePending ||
      (this._task?.kind === "dismount" && this._task.status === "running") ||
      !!this._host.isRiderTransitioning?.()
    );
  }

  private _startTask(task: Task): BehaviorStatus {
    const { kind, params } = task;
    if (kind === "complete" || kind === "reject") {
      if (kind === "complete") this._complete(this._command?.action ?? "complete");
      else this._reject(this._failure);
      this._command = null;
      return (task.status = "success");
    }
    if (kind === "ride" || kind === "wait") return "running";
    if (kind === "enter") {
      this._entrancePending = true;
      if (!this._spawn(this._command?.action === "summon" ? this._command.entry : "sky")) {
        this._entrancePending = false;
        return (task.status = "failure");
      }
      if (this._command?.action === "summon" && this._command.entry === "ground") {
        this._entrancePending = false;
        return (task.status = "success");
      }
      return (task.status = "success");
    } else if (kind === "reveal") {
      task.deadline = task.started + this._profile.dropSeconds + 4;
    } else if (kind === "land") {
      task.deadline = task.started + this._profile.dropSeconds + 1;
    } else if (kind === "animate") {
      const state = params.state as AnimalState;
      if (!this._controller.layers[0].stateMachine.findStateByName(state)) return (task.status = "failure");
      if (state === "eat" && (!this._sample(this._position) || !this._ground.grass)) return (task.status = "failure");
      if (state === "launch") this._rootMotionSample.copyFrom(this._rootOrigin);
      this._change(state, false, true);
      if (params.immediate) return (task.status = "success");
      task.deadline = task.started + this._controller.layers[0].stateMachine.findStateByName(state).clip!.length + 2;
    } else if (kind === "move") {
      this._speed = 0;
      if (!this._planMove(params.target as string)) {
        this._failure = "";
        return (task.status = "failure");
      }
      task.deadline = task.started + 45;
      this._change(params.gait === "walk" ? "walk" : "run");
    } else if (kind === "dismount") {
      if (!this._mounted) return (task.status = this._host.isRiderTransitioning?.() ? "running" : "success");
      task.deadline = task.started + 8;
    } else if (kind === "remove") {
      this._vanishStarted = task.started;
      this._dissolve?.play(false, this._profile.vanishSeconds);
      task.deadline = task.started + this._profile.vanishSeconds + 2;
    }
    return task.status;
  }

  private _finishTask(status: BehaviorStatus = "success", detail?: string): void {
    if (!this._task || this._task.status !== "running") return;
    if (this._task.kind === "land") this._entrancePending = false;
    if (status === "failure" && this._entrancePending) {
      this._entrancePending = false;
      if (this._sample(this._position)) this._position.y = this._ground.height;
      this._applyTransform();
      this._change("idle");
    }
    if (detail) this._failure = detail;
    this._task.cancelDeadline?.();
    this._task.status = status;
    this._dirty = true;
  }

  private _buildController(clips: AnimationClip[]): void {
    const controller = (this._controller = new AnimatorController(this.engine));
    const layer = new AnimatorControllerLayer("Animal");
    controller.addLayer(layer);
    const sink = (kind: "enter" | "marker", state: AnimalState, marker?: string): void => {
      const token = this._stateTokens.get(state);
      if (token !== undefined && !this._disposed && this._present) this._queue.push({ kind, state, marker, token });
    };
    this._animator.entity.addComponent(AnimalAnimationBridge).sink = sink;
    for (const [name, clipName] of Object.entries(this._profile.clips)) {
      const key = name as AnimalState;
      const source = clips.find((candidate) => candidate.name === clipName);
      if (!source) throw new Error(`Missing animal clip: ${clipName}`);
      const clip = createAnimalAnimationClip(source, key);
      this._ownedClips.push(clip);
      const state = layer.stateMachine.addState(name);
      state.clip = clip;
      if (["walk", "walkLeft", "walkRight", "turn"].includes(key)) this._walkStates.push(state);
      if (key === "falling") state.speed = clip.length / this._profile.fallingSeconds;
      state.wrapMode = loopStates.has(key) ? WrapMode.Loop : WrapMode.Once;
      state.addStateMachineScript(AnimalStateEvents).sink = sink;
    }
    layer.stateMachine.defaultState = layer.stateMachine.findStateByName("idle");
    this._animator.animatorController = controller;
  }

  private _change(state: AnimalState, initial = false, restart = false): void {
    if (!this._profile.clips[state])
      state = walkingStates.has(state) ? "walk" : runningStates.has(state) ? "run" : "idle";
    if (!initial && !restart && this._state === state) {
      // The latest decision supersedes any reversal queued during a crossfade.
      this._pendingState = null;
      return;
    }
    const nativeState = this._animator.getCurrentAnimatorState(0);
    if (
      !initial &&
      this._state !== state &&
      (nativeState?.name === state ||
        (ridingStates.has(this._state) && ridingStates.has(state) && nativeState?.name !== this._state))
    ) {
      this._pendingState = state;
      return;
    }
    const sameCycle =
      (walkingStates.has(this._state) && walkingStates.has(state)) ||
      (runningStates.has(this._state) && runningStates.has(state));
    const offset = !initial && !restart && sameCycle ? this._animationPhase : 0;
    this._animationPhase = offset;
    this._animationChangeFrame = this.engine.time.frameCount;
    this._pendingState = null;
    this._state = state;
    this._token++;
    this._stateTokens.set(state, this._token);
    this._stateStarted = this._system.time;
    this._counts.decisions++;
    if (initial) this._animator.play(state, 0);
    else {
      const destination = this._controller.layers[0].stateMachine.findStateByName(state);
      // Engine crossfade weight advances in destination clip seconds, including state speed.
      const fade = this._profile.fadeSeconds * destination.speed * this._animator.speed;
      this._animator.crossFadeInFixedDuration(state, fade, 0, offset);
    }
    this._emit("state", state);
  }

  private _advanceAnimationPhase(dt: number): void {
    if (
      !this._present ||
      this.engine.time.frameCount === this._animationChangeFrame ||
      (!walkingStates.has(this._state) && !runningStates.has(this._state))
    )
      return;
    // Track the destination clock through public state settings; never inspect Animator internals.
    const state = this._controller.layers[0].stateMachine.findStateByName(this._state);
    if (state.clip!.length > 0)
      this._animationPhase =
        (this._animationPhase + (dt * state.speed * this._animator.speed) / state.clip!.length) % 1;
  }

  private _marker(marker: string): void {
    if (marker === "finished") {
      if (this._mounted && this._speed < 0.05 && ["idle", "idleB", "idleC"].includes(this._state)) {
        const alternatives = (["idle", "idleB", "idleC"] as AnimalState[]).filter(
          (state) => state !== this._state && this._profile.clips[state]
        );
        if (alternatives.length) this._change(alternatives[Math.floor(this._nextRandom() * alternatives.length)]);
      }
      if (this._task?.kind === "animate" && this._task.params.state === this._state) {
        if (this._state === "eat") this._emit("grazing", "");
        this._finishTask();
      } else if (this._task?.kind === "move" && this._state === "stop") {
        this._speed = 0;
        this._finishTask();
      }
      return;
    }
  }

  private _spawn(entry: "sky" | "ground"): boolean {
    this._host.readPlayerPosition(this._player);
    this._host.readPlayerForward(this._forward);
    const facing = Math.atan2(this._forward.x, this._forward.z);
    let found = false;
    for (let i = 0; i < 36; i++) {
      const slot = i % 12;
      const searchAngle = ((Math.ceil(slot / 2) * Math.PI) / 6) * (slot % 2 ? 1 : -1);
      const angle = facing + (entry === "sky" ? this._profile.skySideAngle : 0) + searchAngle;
      const distance = [this._profile.spawnDistance, 5 * this._profile.scale, 3 * this._profile.scale][
        Math.floor(i / 12)
      ];
      this._next.set(this._player.x + Math.sin(angle) * distance, 0, this._player.z + Math.cos(angle) * distance);
      if (this._sample(this._next)) {
        found = true;
        break;
      }
    }
    if (!found) {
      this._failure = "";
      return false;
    }
    this._position.copyFrom(this._next);
    this._position.y = this._ground.height + (entry === "sky" ? this._profile.skyHeight : 0);
    const bearing = Math.atan2(this._position.x - this._player.x, this._position.z - this._player.z);
    this._yaw = bearing + (entry === "sky" ? this._profile.skyFacingOffset : Math.PI);
    this._present = true;
    this._vanishStarted = null;
    this._wasNear = false;
    this._requireReentry = false;
    this._model.transform.setScale(this._profile.modelScale, this._profile.modelScale, this._profile.modelScale);
    this._model.isActive = true;
    this._applyTransform();
    // Keep the airborne animation running through reveal and descent.
    this._change(entry === "sky" ? "falling" : "idle", true);
    this._dissolve?.hide();
    this._dissolve?.play(true, this._profile.dropSeconds);
    this._schedulePerception();
    this._emit("spawned", entry);
    return true;
  }

  private _planMove(target: string): boolean {
    if (target === "player") return this._planApproach();
    if (target === "grass") return this._grassAvailable && this._routeTo(this._grassTarget);
    for (let i = 0; i < 12; i++) {
      const angle = this._nextRandom() * Math.PI * 2,
        radius = 2 + this._nextRandom() * 4;
      this._next.set(this._position.x + Math.sin(angle) * radius, 0, this._position.z + Math.cos(angle) * radius);
      if (this._routeTo(this._next)) return true;
    }
    return false;
  }

  private _routeTo(target: Readonly<Vector3>): boolean {
    if (!this._sample(target)) return false;
    const point = new Vector3(target.x, this._ground.height, target.z);
    this._route = [point];
    this._waypoint = 0;
    return true;
  }

  private _updateMove(dt: number): void {
    const task = this._task!;
    if (task.params.target === "player" && this._system.time >= this._repathAt) {
      this._host.readPlayerPosition(this._player);
      this._repathAt = this._system.time + 0.5;
      if (Math.hypot(this._player.x - this._target.x, this._player.z - this._target.z) > 1.1) {
        if (!this._planApproach()) {
          this._finishTask("failure", "");
          return;
        }
        this._change("run");
      }
    }
    if (this._state === "stop") {
      const length = this._controller.layers[0].stateMachine.findStateByName("stop").clip!.length;
      const t = Math.min(1, (this._system.time - this._stateStarted) / length);
      this._speed = this._stopSpeed * (1 - t);
      this._next.set(
        this._position.x + Math.sin(this._yaw) * this._speed * dt,
        this._position.y,
        this._position.z + Math.cos(this._yaw) * this._speed * dt
      );
      if (!this._moveTo(this._next)) this._speed = 0;
      this._applyTransform();
      return;
    }
    while (
      this._waypoint < this._route.length - 1 &&
      Vector3.distance(this._position, this._route[this._waypoint]) < 0.25
    )
      this._waypoint++;
    const target = this._route[this._waypoint];
    if (!target) {
      this._finishTask("failure", "");
      return;
    }
    const dx = target.x - this._position.x,
      dz = target.z - this._position.z,
      distance = Math.hypot(dx, dz);
    const walking = task.params.gait === "walk";
    const stopLength = this._controller.layers[0].stateMachine.findStateByName("stop").clip!.length;
    if (
      this._waypoint === this._route.length - 1 &&
      distance <= (walking ? 0.12 : this._speed * stopLength * 0.5 + 0.1)
    ) {
      if (walking) {
        this._speed = 0;
        this._change("idle");
        this._finishTask();
      } else {
        this._stopSpeed = Math.min(this._speed, (distance * 2) / stopLength);
        this._yaw = Math.atan2(dx, dz);
        this._change("stop");
      }
      return;
    }
    const delta = animalAngleDelta(this._yaw, Math.atan2(dx, dz));
    this._yaw += Math.max(-this._profile.turnSpeed * dt, Math.min(this._profile.turnSpeed * dt, delta));
    this._speed = Math.min(
      walking ? this._profile.walkSpeed : this._profile.gallopSpeed,
      this._speed + 4 * this._profile.scale * dt
    );
    const step = Math.min(distance, this._speed * dt);
    this._next.set(
      this._position.x + (dx / distance) * step,
      this._position.y,
      this._position.z + (dz / distance) * step
    );
    if (!this._moveTo(this._next)) {
      this._finishTask("failure", "");
      return;
    }
    this._locomotionAnimation(walking ? "walk" : "run", delta);
    this._applyTransform();
  }

  private _updateRide(dt: number, dismounting: boolean): void {
    this._host.readRideInput(this._ride);
    if (this._ride.dismount && !dismounting) {
      this.execute({ action: "dismount", requestId: `local-down-${this.engine.time.frameCount}` });
      return;
    }
    this._host.readPlayerForward(this._forward);
    const targetYaw = Math.atan2(this._forward.x, this._forward.z);
    const throttle = this._ride.forward;
    const steering = Math.max(-1, Math.min(1, this._ride.turn));
    const requestedSpeed =
      this._ride.sprint || this._gait === "gallop"
        ? (this._ride.sprintSpeed ?? this._profile.gallopSpeed)
        : (this._ride.cruiseSpeed ?? this._profile.walkSpeed);
    const topSpeed = Number.isFinite(requestedSpeed) ? Math.max(0, requestedSpeed) : 0;
    const wantsStepTurn =
      !dismounting &&
      topSpeed > 0 &&
      throttle === 0 &&
      (Math.abs(steering) > 0.000001 || Math.abs(animalAngleDelta(this._yaw, targetYaw)) > this._profile.turnTolerance);
    const steps = Math.max(1, Math.ceil(dt * 60));
    let actualTurn = 0;
    for (let i = 0; i < steps; i++) {
      const sub = dt / steps;
      const stepping = wantsStepTurn && this._speed <= this._profile.turnStepSpeed + 0.000001;
      stepGroundMountRide(
        this._speed / this._profile.scale,
        dismounting ? -1 : stepping ? 1 : throttle,
        0,
        (stepping ? this._profile.turnStepSpeed : topSpeed) / this._profile.scale,
        sub,
        this._rideStep,
        stepping ? 1 : Math.max(1, topSpeed / (9 * this._profile.scale))
      );
      this._rideStep.speed *= this._profile.scale;
      this._rideStep.distance *= this._profile.scale;
      const averageSpeed = this._rideStep.distance / sub;
      const movingBlend = Math.max(0, Math.min(1, averageSpeed / this._profile.turnStepSpeed - 1));
      const minimumRadius =
        this._profile.turnStepRadius + (1.8 * this._profile.scale - this._profile.turnStepRadius) * movingBlend;
      const radius = Math.max(minimumRadius, averageSpeed / this._profile.rideMaxTurnRate);
      const maxTurn = Math.min(this._rideStep.distance / radius, this._profile.rideMaxTurnRate * sub);
      const wanted =
        Math.abs(steering) > 0.000001
          ? steering * maxTurn
          : animalAngleDelta(this._yaw, targetYaw) * (1 - Math.exp(-this._profile.viewFollowGain * sub));
      const yawStep = dismounting ? 0 : Math.max(-maxTurn, Math.min(maxTurn, wanted));
      const middle = this._yaw + yawStep * 0.5;
      this._next.set(
        this._position.x + Math.sin(middle) * this._rideStep.distance,
        this._position.y,
        this._position.z + Math.cos(middle) * this._rideStep.distance
      );
      if (this._rideStep.distance > 0 && !this._moveTo(this._next)) {
        this._speed = 0;
        break;
      }
      this._speed = this._rideStep.speed;
      this._yaw += yawStep;
      actualTurn += yawStep;
    }
    if (dismounting && this._speed < 0.05 && !this._host.isRiderTransitioning?.()) {
      if (!this._dismount()) this._finishTask("failure", "");
      return;
    }
    this._locomotionAnimation(
      this._speed < 0.05
        ? "idle"
        : this._speed > (runningStates.has(this._state) ? 2.2 : 3) * this._profile.scale
          ? "run"
          : "walk",
      this._stableRideAnimationTurn(actualTurn / dt, dt) * this._profile.turnTolerance * 2
    );
    this._applyTransform();
    this._host.updateRider(this._position, this._yaw);
  }

  private _stableRideAnimationTurn(rate: number, dt: number): number {
    if (this._speed < 0.05) {
      this._rideAnimationTurn = this._rideAnimationCandidate = this._rideAnimationCandidateSeconds = 0;
      return 0;
    }
    // Enter above 8 degrees/second, leave below 3: small view corrections stay on the straight clip.
    const enter = (8 * Math.PI) / 180;
    const exit = (3 * Math.PI) / 180;
    const candidate =
      Math.abs(rate) >= enter
        ? Math.sign(rate)
        : Math.abs(rate) <= exit || Math.sign(rate) !== this._rideAnimationTurn
          ? 0
          : this._rideAnimationTurn;
    if (candidate !== this._rideAnimationCandidate) {
      this._rideAnimationCandidate = candidate;
      this._rideAnimationCandidateSeconds = 0;
    }
    this._rideAnimationCandidateSeconds += dt;
    if (this._rideAnimationCandidateSeconds >= 0.2) this._rideAnimationTurn = candidate;
    return this._rideAnimationTurn;
  }

  private _locomotionAnimation(gait: "idle" | "walk" | "run", delta: number): void {
    // Camera looks along +Z; positive yaw is a left turn in the rider frame.
    this._change(
      gait === "idle"
        ? ["idle", "idleB", "idleC"].includes(this._state)
          ? this._state
          : "idle"
        : Math.abs(delta) < this._profile.turnTolerance
          ? gait
          : gait === "walk"
            ? delta > 0
              ? "walkLeft"
              : "walkRight"
            : delta > 0
              ? "runLeft"
              : "runRight"
    );
  }

  private readonly _onPlayerMoved = (): void => {
    if (!this._active || !this._present || this._mounted || this._transferringControl) return;
    const distance = this._playerDistance();
    if (distance > this._profile.mountExitRadius) {
      this._requireReentry = false;
      this._wasNear = false;
    }
    if (distance <= this._profile.mountRadius) this._considerMount(!this._wasNear);
    this._wasNear = distance <= this._profile.mountRadius;
  };

  private _considerMount(_entering: boolean): void {
    if (
      !this._profile.mountable ||
      !this._present ||
      this._mounted ||
      this._command ||
      this._pendingCommand ||
      this._safeTransition() ||
      this._requireReentry ||
      this._system.time < this._mountLockedUntil
    )
      return;
    if (!["idle", "idleB", "idleC", "eat"].includes(this._state) || this._playerDistance() > this._profile.mountRadius)
      return;
    this._transferringControl = true;
    const acquired = this._host.setRiding(true, this._position, this._yaw);
    this._transferringControl = false;
    if (!acquired) return;
    this._mounted = true;
    this._speed = 0;
    this._counts.mounts++;
    this._tree.halt();
    this._task = null;
    this._change("idle");
    this._dirty = true;
    this._emit("mounted", "");
  }

  private _dismount(): boolean {
    for (const angle of [Math.PI, Math.PI - Math.PI / 12, Math.PI + Math.PI / 12]) {
      this._next.set(
        this._position.x + Math.sin(this._yaw + angle) * this._profile.dismountDistance,
        this._position.y,
        this._position.z + Math.cos(this._yaw + angle) * this._profile.dismountDistance
      );
      if (!this._sample(this._next)) continue;
      this._next.y = this._ground.height;
      this._transferringControl = true;
      const released = this._host.setRiding(false, this._next, this._yaw);
      this._transferringControl = false;
      if (!released) continue;
      this._mounted = false;
      this._requireReentry = true;
      this._mountLockedUntil = this._system.time + this._profile.mountCooldown;
      this._speed = 0;
      this._change("idle");
      this._emit("dismounted", "");
      this._dirty = true;
      return true;
    }
    this._emit("blocked", "");
    return false;
  }

  private _schedulePerception(): void {
    this._cancelPerception?.();
    this._cancelPerception = this._system.schedule(0.5, () => {
      this._cancelPerception = undefined;
      if (this._disposed || !this._active || !this._present) return;
      if (!this._command && !this._mounted) {
        if (this._state === "eat" && (!this._sample(this._position) || !this._ground.grass)) {
          this._change("idle");
          this._finishTask("failure", "grass_unavailable");
        }
        this._refreshGrass();
        this._sample(this._position);
        this._dirty = true;
        this._considerMount(false);
      }
      this._schedulePerception();
    });
  }

  private _refreshGrass(): void {
    this._grassAvailable = false;
    if (!this._profile.clips.eat) return;
    if (this._sample(this._position) && this._ground.grass) {
      this._grassTarget.copyFrom(this._position);
      this._grassAvailable = true;
      return;
    }
    for (let i = 0; i < 16; i++) {
      const radius = i < 8 ? 4 : 8,
        angle = (i * Math.PI) / 4;
      this._next.set(this._position.x + Math.sin(angle) * radius, 0, this._position.z + Math.cos(angle) * radius);
      if (this._sample(this._next) && this._ground.grass) {
        this._grassTarget.set(this._next.x, this._ground.height, this._next.z);
        this._grassAvailable = true;
        return;
      }
    }
  }
  private _sample(point: Readonly<Vector3>): boolean {
    this._counts.groundQueries++;
    return this._host.sampleGround(point.x, point.z, this._ground);
  }

  private _moveTo(point: Readonly<Vector3>): boolean {
    if (!this._sample(point)) return false;
    this._position.set(point.x, this._ground.height, point.z);
    return true;
  }

  private _applyTransform(): void {
    this.entity.transform.setPosition(this._position.x, this._position.y, this._position.z);
    this.entity.transform.setRotation(0, (this._yaw * 180) / Math.PI, 0);
  }

  private _playerDistance(): number {
    this._host.readPlayerPosition(this._player);
    return Math.hypot(this._player.x - this._position.x, this._player.z - this._position.z);
  }

  private _planApproach(): boolean {
    this._host.readPlayerPosition(this._player);
    const angle = Math.atan2(this._position.x - this._player.x, this._position.z - this._player.z);
    for (let i = 0; i < 12; i++) {
      const direction = angle + ((Math.ceil(i / 2) * Math.PI) / 6) * (i % 2 === 0 ? 1 : -1);
      this._next.set(
        this._player.x + Math.sin(direction) * this._profile.arrivalDistance,
        0,
        this._player.z + Math.cos(direction) * this._profile.arrivalDistance
      );
      if (!this._sample(this._next)) continue;
      this._next.y = this._ground.height;
      this._route = [this._next.clone()];
      this._waypoint = 0;
      this._target.copyFrom(this._player);
      this._repathAt = this._system.time + 0.5;
      return true;
    }
    return false;
  }

  private _nextRandom(): number {
    this._random ^= this._random << 13;
    this._random ^= this._random >>> 17;
    this._random ^= this._random << 5;
    return (this._random >>> 0) / 0x100000000;
  }

  private _emit(type: string, detail: string): void {
    this.events.invoke({ type, detail, requestId: this._operation?.requestId ?? null, actionId: this._token });
  }

  private _complete(detail: string): void {
    if (!this._operation || this._operation.status !== "accepted") return;
    this._operation.status = "completed";
    this._operation.detail = detail;
    this._emit("completed", detail);
  }

  private _reject(detail: string): void {
    if (!this._operation) return;
    this._operation.status = "rejected";
    this._operation.detail = detail;
    this._emit("rejected", detail);
  }

  private _cancelOperation(): void {
    if (this._operation?.status === "accepted") {
      this._operation.status = "cancelled";
      this._operation.detail = "";
      this._emit("cancelled", this._operation.detail);
    }
  }
}

/** Signed shortest yaw rotation, in radians. */
export function animalAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
