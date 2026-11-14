import { GroundAnimalRecovery } from "./GroundAnimalRecovery";
import {
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateTransition,
  BaseMaterial,
  Entity,
  Material,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  RenderFace,
  SkinnedMeshRenderer,
  StateMachineScript,
  Transform,
  Vector3,
  WrapMode,
  type AnimationClip,
  type GLTFResource,
  type Quaternion
} from "@galacean/engine";
import {
  AnimalTaskController,
  type AnimalTaskProfile,
  type AnimalTaskRequest,
  type AnimalTargetQuery,
  type AnimalWorldEvent
} from "./AnimalTaskController";
import { type AnimalAgent, type AnimalSystem } from "./AnimalSystem";
import {
  advanceGroundAnimalMotion,
  groundAnimalArrivalRadius,
  groundAnimalTurnClearance,
  type GroundAnimalMotion
} from "./GroundAnimalSteering";
import {
  planAnimalStaticRoute,
  advanceAnimalRouteTarget,
  type AnimalRoutePoint,
  type AnimalRouteQuery
} from "./AnimalStaticRoute";
import { AnimalMotionPlayback } from "./AnimalMotionPlayback";
import { AnimalBlendClock } from "./AnimalBlendClock";
import { animalAnimationClips } from "./AnimalAnimationBasis";
import { animalCollisionRadius, type AnimalAssetConfig } from "./AnimalAssetCatalog";
import { type GroundAnimalCrowd, type GroundAnimalBody } from "./GroundAnimalCrowd";
import {
  animalFlightApproachFits,
  animalFlightBoundaryHeading,
  containsAnimalFlight,
  type AnimalFlightBounds
} from "./AnimalFlightPath";

/** Keep a short seam only for authored gaits whose last pose differs from their first. */
function gaitSeamSeconds(clip: AnimationClip, start: number, end: number): number {
  for (const binding of clip.curveBindings) {
    if (binding.type !== Transform || !["position", "rotationQuaternion", "scale"].includes(binding.property))
      return Math.min(0.04, (end - start) * 0.1);
    const first = binding.curve!.evaluate(start) as Vector3 | Quaternion;
    const x = first.x,
      y = first.y,
      z = first.z;
    const w = "w" in first ? first.w : undefined;
    const last = binding.curve!.evaluate(end) as Vector3 | Quaternion;
    const lastW = "w" in last ? last.w : 0;
    const sign = w !== undefined && x * last.x + y * last.y + z * last.z + w * lastW < 0 ? -1 : 1;
    const mismatch = Math.max(
      Math.abs(x - sign * last.x),
      Math.abs(y - sign * last.y),
      Math.abs(z - sign * last.z),
      w === undefined ? 0 : Math.abs(w - sign * lastW)
    );
    if (mismatch > (w === undefined ? 0.001 : 0.01)) return Math.min(0.04, (end - start) * 0.1);
  }
  return 0;
}

/** Per-instance native sampling receipt; callbacks never mutate playback or the behavior tree. */
class AnimalPoseState extends StateMachineScript {
  sampled = false;
  finished = false;

  override onStateEnter(): void {
    this.sampled = true;
    this.finished = false;
  }

  override onStateUpdate(): void {
    this.sampled = true;
  }

  override onStateExit(): void {
    // The terminal sample advanced too; only a state already finished BEFORE
    // update is a held pose. Rejecting this receipt brakes every one-shot gait.
    this.sampled = true;
    this.finished = true;
  }
}

/** Host-owned support and traversal queries, independent of any terrain or POI implementation. */
export interface AnimalGroundSurface {
  /** Convex map boundary for constant-time airborne steering; host terrain is queried only for elevation and landing. */
  flightBounds?: Readonly<AnimalFlightBounds>;
  /** World support height in metres; undefined means unsupported ground. */
  heightAt(x: number, z: number, medium?: "ground" | "air" | "water"): number | undefined;
  /**
   * Capture static geometry for a movement task; the returned query does not include moving animals.
   * @param radius Physical footprint radius in metres.
   * @param medium Travel medium.
   * @returns Static path and obstacle queries for route planning.
   */
  staticRouteQuery?(radius: number, medium: "ground" | "air" | "water"): AnimalRouteQuery;
  /**
   * Check the actual airborne movement segment against terrain and static volumes.
   * @param from Previous world position in metres.
   * @param to Proposed world position in metres.
   * @param radius Horizontal physical footprint radius.
   * @param height Physical height above the root.
   * @returns Whether the swept body is clear.
   */
  canTraverseAir?(
    from: { x: number; y: number; z: number },
    to: { x: number; y: number; z: number },
    radius: number,
    height: number
  ): boolean;
  /** Validate physical support, footprint collisions and world bounds. */
  canTraverse(
    from: Readonly<GroundAnimalMotion>,
    to: Readonly<GroundAnimalMotion>,
    radius: number,
    medium?: "ground" | "air" | "water"
  ): boolean;
}

/** Optional world support and reproducible behavior sampling. */
export interface ConfiguredAnimalOptions {
  ground?: AnimalGroundSurface;
  random?: () => number;
  /** Hidden movement integration interval in simulation seconds; defaults to one. */
  distantUpdateSeconds?: number;
  /** Apply a world interaction after its guarded animation completes. */
  completeInteraction?: (query: AnimalTargetQuery) => void;
  /** Bind a world target and return the continuous interaction duration in simulation seconds. */
  beginInteraction?: (query: AnimalTargetQuery) => number | undefined;
  /** Confirm arrival before starting the shared interaction deadline. */
  interactionReady?: (query: AnimalTargetQuery) => boolean;
  /** Cheap cached interaction-stance predicate, evaluated after committed locomotion. */
  arrivedAtInteraction?: (destination: readonly [number, number]) => boolean;
  /** Optional precision for the current interaction waypoint, in world metres. */
  interactionArrivalRadius?: (destination: readonly [number, number]) => number | undefined;
  /** Release an interaction target after cancellation or completion. */
  cancelInteraction?: (query: AnimalTargetQuery) => void;
  /** Borrow a host-owned material; the host releases it after all animal instances. */
  resolveMaterial?: (source: Material) => Material;
}

/** Configured presentation and basic behavior above the shared animal scheduler. */
export class ConfiguredAnimal implements AnimalAgent {
  private readonly root: Entity;
  private readonly calibration: Entity;
  private model!: Entity;
  private controller!: AnimatorController;
  private animator!: Animator;
  private loadedResource?: GLTFResource;
  readonly behavior: AnimalTaskController;
  private readonly ownedMaterials = new Set<Material>();
  private readonly durations: number[] = [];
  private readonly gaitSeams: number[] = [];
  private readonly inverse = new Matrix();
  private readonly anchorPosition = new Vector3();
  private readonly anchorReference = new Vector3();
  private anchor?: Entity;
  private readonly playback = new AnimalMotionPlayback();
  private locomotionSpeed = 0;
  private clipStartedFrame = -1;
  private readonly proposedMotion: GroundAnimalMotion = { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 };
  private clip = -1;
  private disposed = false;
  private manual = false;
  private readonly motion: GroundAnimalMotion = { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 };
  private readonly destination: [number, number] = [0, 0];
  private finishAnimation?: () => void;
  private velocity = 0;
  private urgentMovement = false;
  private finishMove?: (success: boolean) => void;
  private speedMultiplier = 1;
  private readonly renderers: MeshRenderer[] = [];
  private readonly rendererEnabled: boolean[] = [];
  private shadowsEnabled = false;
  private rendered = true;
  scale: number;
  private crowdBody?: GroundAnimalBody;
  private readonly baseRadius: number;
  private wasBlocked = false;
  private locomotionSteps = 0;
  private unsupportedMotionSteps = 0;
  private presentedHeading = 0;
  private maxTurnRadiansPerSecond = 0;
  private active = true;
  private suspended = false;
  private distant = false;
  private deferredClip: number | undefined;
  private cancelAnimationDeadline?: () => void;
  private restAnimationAt?: number;
  private distantFlightUpdates = 0;
  private distantActivityUpdates = 0;
  private surfaceBlocked = false;
  private readonly groundRecovery = new GroundAnimalRecovery();
  private readonly groundPrediction: GroundAnimalMotion = { x: 0, z: 0, heading: 0, speed: 0, angularSpeed: 0 };
  private readonly groundCheckpoint = { ...this.groundPrediction };
  private readonly airSteering = { maxAngularSpeed: 0.8, turnSpeedRatio: 0.65, arrivalRadius: 0.3, continuous: false };
  private readonly groundSteering = {
    maxAngularSpeed: 0.3,
    turnSpeedRatio: 0.5,
    arrivalRadius: 0.1,
    continuous: false,
    urgent: false
  };
  private route?: {
    points: AnimalRoutePoint[];
    cursor: number;
    passRadius: number;
    speed: number;
    medium: string;
    scale: number;
    multiplier: number;
    arrivalMedium?: "ground" | "water";
    preparedAt: number;
    from: GroundAnimalMotion & { y?: number };
  };
  private preparedRoute?: {
    points: AnimalRoutePoint[];
    cursor: number;
    passRadius: number;
    speed: number;
    medium: string;
    scale: number;
    multiplier: number;
    arrivalMedium?: "ground" | "water";
    preparedAt: number;
    from: GroundAnimalMotion & { y?: number };
  };
  private pendingRest?: { index: number; medium: "ground" | "water" };
  private readonly poseTransforms: Transform[] = [];
  private readonly nativeStates: { name: string; pose: AnimalPoseState }[][] = [];
  private readonly nativeClipIndices = new Map<string, number>();
  private activeState!: { name: string; pose: AnimalPoseState };
  private crossfadeCount = 0;
  private directPlayCount = 0;
  private lastBlendSeconds = 0;
  private poseBefore = new Float64Array(0);
  private sampledAnimationSeconds = 0;
  private sampledGait = false;
  private blockedPoseSteps = 0;
  private nativeTransition = new AnimatorStateTransition();
  private readonly blendClock = new AnimalBlendClock();
  private changingMedium = false;
  private movementMedium: "ground" | "air" | "water" = "ground";
  private arrivalHeight: number | undefined;
  private arrivalMedium: "ground" | "water" | undefined;
  private actionPace = 1;
  private landings = 0;
  private stationaryAirSeconds = 0;
  private longestStationaryAirSeconds = 0;
  private peakNormalSpeed = 0;
  private peakRaisedPaceSpeed = 0;
  private nextFlightProbe = 0;
  private nextFlightReplanRequest = 0;
  private flightNeedsReplan = false;
  /** Temporary steering only; destination remains the behavior task's requested landing. */
  private continuationTarget?: [number, number];
  private flightReplans = 0;
  private flightPathChecks = 0;
  private lastFlightPlan: unknown;
  private readonly longestAirPause = { distance: 0, height: 0, landingHeight: 0, traffic: false, surface: false };

  /**
   * Own one scene instance; borrow its GLB and use the host's shared simulation clock.
   * @param parent Host scene parent.
   * @param config Application-owned asset corrections and verified source animations.
   * @param resource Shared GLB; release only after every borrowing instance is disposed.
   * @param system Scene scheduler, including action deadlines and behavior wakeups.
   * @param position Independent spawn position on the XZ plane.
   * @param profile Registered task recipes, weighted compatible animations and fallback policy.
   * @param resolveTarget Host-owned spatial queries; unavailable targets return null.
   * @param crowd Optional shared ground movement and collision world.
   * @param heading Initial continuous heading in radians, including appearance replacement.
   * @param options Optional terrain support/traversal and deterministic behavior random source.
   */
  constructor(
    parent: Entity,
    readonly config: AnimalAssetConfig,
    resource: GLTFResource | undefined,
    private readonly system: AnimalSystem,
    position: readonly [number, number],
    private readonly profile: AnimalTaskProfile,
    resolveTarget: (query: AnimalTargetQuery, event: AnimalWorldEvent | null) => readonly [number, number] | null,
    private readonly crowd?: GroundAnimalCrowd,
    heading = 0,
    private readonly options: ConfiguredAnimalOptions = {}
  ) {
    if (
      options.distantUpdateSeconds !== undefined &&
      (!Number.isFinite(options.distantUpdateSeconds) ||
        options.distantUpdateSeconds <= 0 ||
        options.distantUpdateSeconds > 5)
    )
      throw new RangeError("Invalid distant animal update interval");
    Object.assign(this.airSteering, config.flightSteering);
    for (const binding of config.animations) {
      const duration = binding.range ? binding.range[1] - binding.range[0] : binding.duration;
      if (!resource && (!Number.isFinite(duration) || duration! <= 0))
        throw new Error(`Unloaded animal requires verified clip duration: ${binding.id}`);
      this.durations.push(duration ?? 0);
      this.gaitSeams.push(0);
    }
    this.movementMedium = profile.preferredMedium ?? "ground";
    const height = options.ground ? options.ground.heightAt(position[0], position[1], this.movementMedium) : 0;
    if (height === undefined || !Number.isFinite(height)) throw new Error("Animal spawn has no ground support");
    this.root = parent.createChild(`Animal: ${config.id}`);
    this.root.transform.setPosition(
      position[0],
      height - (this.movementMedium === "water" ? (config.waterline ?? 0) * config.scale : 0),
      position[1]
    );
    this.motion.x = position[0];
    this.motion.z = position[1];
    this.motion.heading = this.presentedHeading = heading;
    this.root.transform.setRotation(0, (heading * 180) / Math.PI, 0);
    this.calibration = this.root.createChild("Asset calibration");
    this.scale = config.scale;
    this.baseRadius = animalCollisionRadius(config) / config.scale;
    try {
      if (resource) this.attachResource(resource);
      this.selectClip(config.animations.findIndex((binding) => binding.id === config.initialAnimation));
      if (crowd) {
        this.crowdBody = {
          motion: this.motion,
          radius: this.baseRadius * this.scale,
          bodyLength: (config.bounds.max[2] - config.bounds.min[2]) * this.scale,
          steering: this.movementMedium === "air" ? this.airSteering : this.surfaceSteering,
          desiredSpeed: 0,
          target: this.destination,
          arrived: false,
          blocked: false,
          layer: this.movementMedium,
          elevation: this.root.transform.position.y,
          height: (config.bounds.max[1] - config.bounds.min[1]) * config.scale,
          motionFraction: (seconds, proposed) => this.prepareAnimation(seconds, proposed),
          recovery: this.groundRecovery,
          canTranslate: (proposed, from) => this.canTranslate(proposed, from)
        };
        crowd.add(this.crowdBody);
      }
      this.behavior = new AnimalTaskController(
        profile,
        {
          get time() {
            return system.time;
          },
          synchronize: () => {
            system.synchronizeMotion(this);
            this.synchronizeRestAnimation();
          },
          wake: () => system.requestWake(this),
          schedule: (seconds, callback) => system.schedule(seconds, callback, this),
          play: (id, speed, medium, pace, urgent, preservePhase) =>
            this.playBehaviorAnimation(id, speed, medium, pace, preservePhase, urgent),
          onAnimationEnd: (callback) => {
            this.finishAnimation = callback;
            this.scheduleRestAnimation();
            return () => {
              if (this.finishAnimation === callback) {
                this.finishAnimation = undefined;
                this.cancelAnimationDeadline?.();
                this.cancelAnimationDeadline = undefined;
              }
            };
          },
          resolveTarget: (query, event, nominalSpeed) => {
            if (
              query.query === "wander" &&
              (query.params?.medium ?? this.movementMedium) !== "air" &&
              query.params?.distance === undefined &&
              nominalSpeed
            ) {
              const speed = nominalSpeed * this.scale * this.speedMultiplier;
              const length = Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale);
              const steering = this.surfaceSteering;
              const angularSpeed = Math.min(steering.maxAngularSpeed, speed / (length * 1.25));
              // A freely chosen leg must span a turning diameter; a tiny lateral
              // goal would otherwise force the terminal solver back into small steps.
              const distance = Math.max(3, (2 * speed * steering.turnSpeedRatio) / angularSpeed);
              return resolveTarget({ ...query, params: { ...query.params, distance } }, event);
            }
            return resolveTarget(query, event);
          },
          isAtTarget: (target) =>
            this.movementMedium !== "air" &&
            Math.hypot(target[0] - this.motion.x, target[1] - this.motion.z) <=
              groundAnimalArrivalRadius((this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale),
          completeInteraction: options.completeInteraction,
          beginInteraction: options.beginInteraction,
          interactionReady: options.interactionReady,
          cancelInteraction: options.cancelInteraction,
          movementBlocked: () => !this.distant && (this.crowdBody?.blocked ?? false),
          canMoveTo: (target, speed, medium) =>
            (!medium || this.checkFlightPath(target, speed, medium)) &&
            this.prepareRoute(target, speed, medium ? "air" : this.movementMedium, medium),
          prefersMoveTo: (target, speed) => this.distant || this.checkGroundPath(target, speed),
          movementNeedsReplan: () => {
            if (!this.flightNeedsReplan || system.time < this.nextFlightReplanRequest) return false;
            this.nextFlightReplanRequest = system.time + 0.25;
            return true;
          },
          currentLanding: () => (this.arrivalMedium ? this.destination : null),
          moveTo: (target, speed, finish, arrivalMedium) => {
            const changedIntent =
              this.changingMedium ||
              this.velocity !== speed ||
              this.arrivalMedium !== arrivalMedium ||
              target[0] !== this.destination[0] ||
              target[1] !== this.destination[1];
            const changedTarget = target[0] !== this.destination[0] || target[1] !== this.destination[1];
            if (changedTarget) this.groundRecovery.reset();
            if (this.flightNeedsReplan && changedTarget) this.flightReplans++;
            // Replaying a gait toward the same goal cannot acknowledge a route-invalid event.
            // Otherwise a clip completion inside a coarse step swallows the pending tree wake.
            if (this.continuationTarget && arrivalMedium && this.checkFlightPath(target, speed, arrivalMedium)) {
              this.continuationTarget = undefined;
              this.airSteering.continuous = false;
              this.flightNeedsReplan = false;
            } else if (changedTarget && !this.continuationTarget) this.flightNeedsReplan = false;
            if (changedIntent) this.nextFlightProbe = 0;
            const medium = arrivalMedium ? "air" : this.movementMedium;
            if (!this.prepareRoute(target, speed, medium, arrivalMedium)) {
              finish(false);
              return () => {};
            }
            if (
              this.crowdBody &&
              !this.crowd!.reserve(
                this.crowdBody,
                target[0],
                target[1],
                this.options.ground?.heightAt(target[0], target[1], arrivalMedium ?? medium) ?? this.position.y,
                arrivalMedium ?? medium
              )
            ) {
              finish(false);
              return () => {};
            }
            // A gait handoff can cancel its previous move while bodies cross.
            // Only a successfully admitted replacement supersedes that deferred rest.
            this.pendingRest = undefined;
            this.acceptPreparedRoute();
            this.arrivalMedium = arrivalMedium;
            this.velocity = speed;
            this.destination[0] = target[0];
            this.destination[1] = target[1];
            this.arrivalHeight = arrivalMedium
              ? this.options.ground
                ? this.options.ground.heightAt(target[0], target[1], arrivalMedium)
                : 0
              : undefined;
            if (arrivalMedium && this.arrivalHeight === undefined) {
              this.velocity = 0;
              this.updateCrowdIntent();
              finish(false);
              return () => {};
            }
            if (this.arrivalHeight !== undefined && arrivalMedium === "water")
              this.arrivalHeight -= (this.config.waterline ?? 0) * this.scale;
            this.updateCrowdIntent();
            this.finishMove = finish;
            system.setMoving(this, this.active || this.velocity > 0);
            return () => {
              this.finishMove = undefined;
              // Command cancellation relinquishes the callback, not aerodynamic
              // support. Keep the old approach until a replacement is accepted.
              if (this.movementMedium !== "air") {
                if (this.crowdBody && !this.crowd!.canOccupy(this.crowdBody, this.motion.x, this.motion.z)) {
                  this.pendingRest = {
                    index: config.animations.findIndex((binding) => binding.id === config.initialAnimation),
                    medium: this.movementMedium
                  };
                  return;
                }
                this.velocity = 0;
                this.arrivalHeight = undefined;
                this.arrivalMedium = undefined;
                this.updateCrowdIntent();
              }
            };
          }
        },
        options.random
      );
      system.register(this);
      if (!resource) this.setStreamingState(false, false, true);
    } catch (error) {
      if (this.crowdBody) crowd?.remove(this.crowdBody);
      this.root.destroy();
      this.controller?.destroy();
      for (const material of this.ownedMaterials) material.destroy();
      throw error;
    }
  }

  /** Whether a model and native animator have been attached to this logical animal. */
  get hasPresentation(): boolean {
    return this.loadedResource !== undefined;
  }

  /** Shared borrowed GLB. Available after presentation attachment. */
  get resource(): GLTFResource {
    if (!this.loadedResource) throw new Error("Animal presentation is not loaded");
    return this.loadedResource;
  }

  /**
   * Mount a borrowed model without replacing the logical task, position or animation phase.
   * @param resource Loaded GLB matching this animal's registered bindings.
   * @throws If the resource is incompatible or another resource is already attached.
   */
  attachResource(resource: GLTFResource): void {
    if (this.disposed) throw new Error("Animal is disposed");
    if (this.loadedResource) {
      if (this.loadedResource === resource) return;
      throw new Error("Animal presentation is already attached");
    }
    this.system.synchronizeMotion(this);
    this.synchronizeRestAnimation();
    const config = this.config;
    const clips = animalAnimationClips(resource, config);
    for (let index = 0; index < config.animations.length; index++) {
      const binding = config.animations[index];
      const matches = clips.filter((clip) => clip.name === binding.clip);
      if (matches.length !== 1 || matches[0].length <= 0)
        throw new Error(`Missing or ambiguous animal clip: ${binding.clip}`);
      const [start, end] = binding.range ?? [0, matches[0].length];
      if (end > matches[0].length + 0.001) throw new Error(`Animal animation range exceeds clip: ${binding.id}`);
      if (this.clip >= 0 && Math.abs(this.durations[index] - (end - start)) > 0.001)
        throw new Error(`Animal clip duration differs from verified metadata: ${binding.id}`);
      this.durations[index] = end - start;
      this.gaitSeams[index] = binding.speed ? gaitSeamSeconds(matches[0], start, end) : 0;
    }
    this.model = resource.instantiateSceneRoot();
    this.calibration.addChild(this.model);
    this.controller = new AnimatorController(this.root.engine);
    try {
      const animators: Animator[] = [];
      this.model.getComponentsIncludeChildren(Animator, animators);
      if (animators.length !== 1) throw new Error(`Animal requires one Animator; found ${animators.length}`);
      this.animator = animators[0];
      this.animator.enabled = false;
      const layer = new AnimatorControllerLayer("Configured animal actions");
      this.controller.addLayer(layer);
      const reservedNames = new Set(config.animations.map((binding) => binding.id));
      for (let index = 0; index < config.animations.length; index++) {
        const binding = config.animations[index];
        const states: { name: string; pose: AnimalPoseState }[] = [];
        // The native animator rejects either occupied transition endpoint. Three state bindings
        // let immediate replay/interruption reuse the same clip from the current displayed pose.
        for (let alias = 0; alias < 3; alias++) {
          let name = alias === 0 ? binding.id : `${binding.id}::blend${alias}`;
          if (alias > 0) {
            while (reservedNames.has(name)) name += "_";
            reservedNames.add(name);
          }
          const state = layer.stateMachine.addState(name);
          state.clip = clips.find((clip) => clip.name === binding.clip)!;
          state.wrapMode = WrapMode.Once;
          states.push({ name, pose: state.addStateMachineScript(AnimalPoseState) });
          this.nativeClipIndices.set(name, index);
          if (binding.range) {
            state.clipStartTime = binding.range[0] / state.clip.length;
            state.clipEndTime = binding.range[1] / state.clip.length;
          }
        }
        this.nativeStates.push(states);
      }
      this.animator.animatorController = this.controller;
      const renderers = this.renderers;
      this.model.getComponentsIncludeChildren(MeshRenderer, renderers);
      if (!renderers.length) throw new Error("Animal GLB has no renderers");
      this.rendererEnabled.push(...renderers.map((renderer) => renderer.enabled));
      for (const renderer of renderers) {
        if (renderer instanceof SkinnedMeshRenderer && renderer.skin) {
          // Native cloning remaps the skin root before rebinding its transform listener.
          // Reassign through the public setter so bounds and model matrices follow this instance.
          const skin = renderer.skin;
          renderer.skin = null!;
          renderer.skin = skin;
        }
        renderer.castShadows = renderer.receiveShadows = this.shadowsEnabled;
        renderer.getMaterials().forEach((material, index) => {
          if (!material) return;
          const name = material.name;
          const correction = config.materials?.find((entry) => entry.name === name);
          material = this.options.resolveMaterial?.(material) ?? material;
          renderer.setMaterial(index, material);
          if (!correction) return;
          const owned = material.clone() as BaseMaterial;
          this.ownedMaterials.add(owned);
          if (correction.opaque) {
            owned.isTransparent = false;
            owned.alphaCutoff = 0;
          }
          if (correction.doubleSided !== undefined)
            owned.renderFace = correction.doubleSided ? RenderFace.Double : RenderFace.Front;
          renderer.setMaterial(index, owned);
        });
      }
      if (config.rootMotionNode) {
        this.anchor = this.model.findByName(config.rootMotionNode) ?? undefined;
        if (!this.anchor) throw new Error(`Missing root motion node: ${config.rootMotionNode}`);
      }
      this.model.getComponentsIncludeChildren(Transform, this.poseTransforms);
      this.poseBefore = new Float64Array(this.poseTransforms.length * 10);
      this.loadedResource = resource;
      if (!this.rendered) for (const renderer of this.renderers) renderer.enabled = false;
      if (this.clip >= 0) this.deferredClip = this.clip;
    } catch (error) {
      this.model.destroy();
      this.controller.destroy();
      this.nativeStates.length = this.renderers.length = this.rendererEnabled.length = this.poseTransforms.length = 0;
      this.nativeClipIndices.clear();
      this.animator = undefined!;
      this.controller = undefined!;
      this.model = undefined!;
      this.anchor = undefined;
      for (const material of this.ownedMaterials) material.destroy();
      this.ownedMaterials.clear();
      throw error;
    }
  }

  /** Revalidate an ongoing route after the host publishes changed static geometry or support. */
  refreshWorld(): void {
    const previous = this.route;
    this.route = this.preparedRoute = undefined;
    if (this.velocity > 0) {
      if (this.prepareRoute(this.destination, this.velocity, this.movementMedium, this.arrivalMedium)) {
        this.acceptPreparedRoute();
      } else if (this.movementMedium === "air") {
        this.route = previous;
        this.flightNeedsReplan = true;
        this.nextFlightReplanRequest = 0;
      } else {
        const finish = this.finishMove;
        this.finishMove = undefined;
        finish?.(false);
      }
    }
    this.updateCrowdIntent();
    this.behavior.worldChanged();
  }

  /** Resume behavior only after a queued simulation event; terminal trees restart next frame. */
  evaluateBehavior(): void {
    // External facts invalidate a cruising route. Recovery already rechecks at
    // 0.25 seconds; its own wake must not turn that bounded retry into a frame loop.
    if (!this.flightNeedsReplan) this.nextFlightProbe = 0;
    if (this.disposed || this.suspended || (!this.active && !this.distant) || this.manual) return;
    this.behavior.tick();
  }

  /** Integrate active animation and optional locomotion from the shared simulation clock. */
  advanceMotion(seconds: number, coarse = false): void {
    if (this.disposed || this.suspended || (!this.active && !this.distant) || this.clip < 0 || seconds <= 0) return;
    if (coarse || !this.animator) {
      this.advanceCoarseMotion(seconds);
      return;
    }
    this.probeMovementPath();
    if (this.crowdBody) {
      this.surfaceBlocked = this.crowdBody.surfaceBlocked ?? false;
      this.root.transform.setRotation(0, (this.motion.heading * 180) / Math.PI, 0);
      this.placeOnGround(seconds);
    }
    // Completed clips hold until the scheduler selects the next action.
    this.wakeForTrafficChange();
    if (!this.crowdBody) {
      Object.assign(this.proposedMotion, this.motion);
      let arrived = false;
      if (this.velocity > 0 && !this.manual)
        arrived = advanceGroundAnimalMotion(
          this.proposedMotion,
          this.movementTarget,
          this.velocity * this.scale * this.speedMultiplier,
          Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale),
          seconds,
          undefined,
          this.movementMedium === "air" ? this.airSteering : this.surfaceSteering
        );
      else this.proposedMotion.speed = this.proposedMotion.angularSpeed = 0;
      const supported = arrived
        ? this.canTranslate(this.proposedMotion)
        : this.resolveGroundMotion(this.proposedMotion, seconds);
      const fraction = this.prepareAnimation(seconds, this.proposedMotion);
      this.surfaceBlocked = !supported;
      const translationAllowed = fraction > 0 && supported;
      const turningAllowed =
        translationAllowed && (this.proposedMotion.x !== this.motion.x || this.proposedMotion.z !== this.motion.z);
      if (translationAllowed) {
        this.motion.x += (this.proposedMotion.x - this.motion.x) * fraction;
        this.motion.z += (this.proposedMotion.z - this.motion.z) * fraction;
      }
      if (turningAllowed) this.motion.heading += (this.proposedMotion.heading - this.motion.heading) * fraction;
      this.motion.speed = translationAllowed ? this.proposedMotion.speed : 0;
      this.motion.angularSpeed = turningAllowed ? this.proposedMotion.angularSpeed : 0;
      this.root.transform.setRotation(0, (this.motion.heading * 180) / Math.PI, 0);
      this.placeOnGround(seconds);
      if (arrived && fraction === 1 && translationAllowed && this.hasArrivedVertically()) this.completeMovement();
    } else if (this.crowdBody.arrived && this.velocity > 0 && this.hasArrivedVertically()) this.completeMovement();
    if (this.velocity > 0 && this.options.arrivedAtInteraction?.(this.destination)) this.completeMovement();
    if (this.surfaceBlocked && this.movementMedium === "air" && this.velocity > 0) {
      this.continueFlight();
    } else if (this.surfaceBlocked && this.velocity > 0) {
      this.velocity = 0;
      this.updateCrowdIntent();
      const finish = this.finishMove;
      this.finishMove = undefined;
      finish?.(false);
    }
    this.settlePendingRest();
    const animationSeconds = this.sampledAnimationSeconds;
    // Audit applied orientation, not the reported angular velocity: wrapped-angle jumps
    // can occur while the steering solver reports angularSpeed=0 at the end of a turn.
    this.maxTurnRadiansPerSecond = Math.max(
      this.maxTurnRadiansPerSecond,
      Math.abs(this.motion.heading - this.presentedHeading) / seconds
    );
    this.presentedHeading = this.motion.heading;
    this.reportMovementEffort();
    if (this.motion.speed > 1e-8 || Math.abs(this.motion.angularSpeed) > 1e-8) {
      this.locomotionSteps++;
      if (animationSeconds <= 0 || !this.sampledGait) this.unsupportedMotionSteps++;
    }
    if (!this.manual && this.movementMedium === "air" && this.motion.speed < 0.1) {
      this.stationaryAirSeconds += seconds;
      if (this.stationaryAirSeconds > this.longestStationaryAirSeconds) {
        this.longestStationaryAirSeconds = this.stationaryAirSeconds;
        this.longestAirPause.distance = Math.hypot(
          this.destination[0] - this.motion.x,
          this.destination[1] - this.motion.z
        );
        this.longestAirPause.height = this.position.y;
        this.longestAirPause.landingHeight = this.arrivalHeight ?? this.position.y;
        this.longestAirPause.traffic = this.crowdBody?.blocked ?? false;
        this.longestAirPause.surface = this.surfaceBlocked;
      }
    } else this.stationaryAirSeconds = 0;
    if (!this.manual) {
      if (this.actionPace > 1) this.peakRaisedPaceSpeed = Math.max(this.peakRaisedPaceSpeed, this.motion.speed);
      else this.peakNormalSpeed = Math.max(this.peakNormalSpeed, this.motion.speed);
    }
    this.completeAnimation();
  }

  /** Apply a behavior-selected pose without discarding a still-running movement task. */
  private playBehaviorAnimation(
    id: string,
    locomotionSpeed = 0,
    medium: "ground" | "air" | "water" = "ground",
    paceMultiplier = 1,
    preservePhase = false,
    urgent = false
  ): number {
    const escaping = urgent && locomotionSpeed > 0;
    if (escaping && !this.urgentMovement) this.groundRecovery.reset();
    this.urgentMovement = escaping;
    const index = this.config.animations.findIndex((binding) => binding.id === id);
    if (
      locomotionSpeed === 0 &&
      this.movementMedium !== "air" &&
      this.velocity > 0 &&
      this.crowdBody &&
      !this.crowd!.canOccupy(this.crowdBody, this.motion.x, this.motion.z)
    ) {
      this.pendingRest = { index, medium: medium === "water" ? "water" : "ground" };
      return this.durations[index];
    }
    this.pendingRest = undefined;
    if (locomotionSpeed === 0 && this.movementMedium !== "air" && !this.finishMove) {
      this.route = this.preparedRoute = undefined;
      if (this.crowdBody) this.crowd!.release(this.crowdBody);
      this.velocity = 0;
    }
    const continuing =
      preservePhase &&
      index === this.clip &&
      this.locomotionSpeed > 0 &&
      locomotionSpeed > 0 &&
      this.movementMedium === medium &&
      this.playback.elapsed < this.duration &&
      (!this.active || !this.animator || (!this.activeState.pose.finished && this.animator.speed > 0));
    this.manual = false;
    this.actionPace = paceMultiplier;
    if (this.movementMedium === "air" && medium !== "air" && this.hasArrivedVertically()) this.landings++;
    if (this.movementMedium === "air" && medium !== "air") {
      this.velocity = 0;
      this.arrivalHeight = undefined;
      this.arrivalMedium = undefined;
      this.continuationTarget = undefined;
      this.airSteering.continuous = false;
    }
    this.changingMedium ||= this.movementMedium !== medium;
    this.movementMedium = medium;
    if (this.crowdBody && medium === "air") this.crowdBody.layer = "air";
    this.locomotionSpeed = locomotionSpeed;
    if (!continuing) this.selectClip(index, true);
    else this.updateCrowdIntent();
    this.system.setMoving(this, this.active || this.velocity > 0);
    return continuing ? this.duration - this.playback.elapsed : this.durations[index];
  }

  /** A stop requested during a crossing keeps its gait until its own footprint is free. */
  private settlePendingRest(): void {
    const pending = this.pendingRest;
    if (!pending || !this.crowdBody || !this.crowd!.canOccupy(this.crowdBody, this.motion.x, this.motion.z)) return;
    this.pendingRest = undefined;
    this.locomotionSpeed = this.motion.speed = this.motion.angularSpeed = 0;
    if (!this.finishMove) {
      this.velocity = 0;
      this.route = this.preparedRoute = undefined;
      this.crowd!.release(this.crowdBody);
    }
    this.movementMedium = pending.medium;
    const finish = this.finishAnimation;
    this.selectClip(pending.index, true);
    this.finishAnimation = finish;
    this.updateCrowdIntent();
    this.scheduleRestAnimation();
  }

  private completeAnimation(): void {
    if (this.playback.elapsed < this.duration) return;
    if (this.pendingRest && this.velocity > 0) {
      const finish = this.finishAnimation;
      this.selectClip(this.clip, true);
      this.finishAnimation = finish;
      return;
    }
    this.cancelAnimationDeadline?.();
    this.cancelAnimationDeadline = undefined;
    this.restAnimationAt = undefined;
    const finish = this.finishAnimation;
    this.finishAnimation = undefined;
    finish?.();
  }

  private synchronizeRestAnimation(): void {
    if (this.restAnimationAt === undefined) return;
    this.playback.elapsed = Math.min(
      this.duration,
      this.playback.elapsed + (this.system.time - this.restAnimationAt) * this.playback.rate
    );
    this.restAnimationAt = this.system.time;
  }

  private scheduleRestAnimation(): void {
    this.cancelAnimationDeadline?.();
    this.cancelAnimationDeadline = undefined;
    this.restAnimationAt = undefined;
    if (!this.distant || this.velocity > 0 || !this.finishAnimation) return;
    this.system.setMoving(this, false);
    this.restAnimationAt = this.system.time;
    this.cancelAnimationDeadline = this.system.schedule(
      Math.max(0, this.duration - this.playback.elapsed) / this.playback.rate,
      () => {
        this.cancelAnimationDeadline = undefined;
        this.playback.elapsed = this.duration;
        this.completeAnimation();
      },
      this
    );
  }

  private prepareAnimation(seconds: number, proposed: Readonly<GroundAnimalMotion>): number {
    this.surfaceBlocked = false;
    this.sampledAnimationSeconds = 0;
    this.sampledGait = false;
    if (!this.active || !this.animator) return 0;
    const state = this.animator.findAnimatorState(this.activeState.name, 0);
    const poseState = this.activeState.pose;
    if (poseState.finished) this.playback.elapsed = this.duration;
    const nativeRate = this.animator.speed * (state?.speed ?? 0);
    // A short manually previewed one-shot may end before its fade. Finish blending
    // into its terminal pose, but never grant displacement to that held pose.
    if (
      this.playback.elapsed >= this.duration &&
      this.blendClock.remaining > 0 &&
      this.root.isActiveInHierarchy &&
      Number.isFinite(nativeRate) &&
      this.animator.speed > 0 &&
      !!state &&
      state.speed > 0
    ) {
      this.nativeTransition.duration = this.blendClock.advance(seconds, seconds * nativeRate);
      this.animator.update(seconds);
      this.correctRootMotion();
      return 0;
    }
    const ready =
      !poseState.finished &&
      Number.isFinite(nativeRate) &&
      this.root.isActiveInHierarchy &&
      this.root.engine.time.frameCount !== this.clipStartedFrame &&
      this.animator.speed > 0 &&
      !!state &&
      state.speed > 0;
    const fraction = this.playback.prepare(
      ready ? seconds * nativeRate : seconds,
      proposed,
      Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale),
      ready
    );
    const animationSeconds = this.playback.advance();
    this.sampledAnimationSeconds = animationSeconds;
    if (animationSeconds > 0) {
      // Sample before the crowd commits any translation. A requested clock interval is not
      // proof of motion: rejected transitions, finished clips and paused animators can hold a pose.
      if (fraction > 0) this.readPose(false);
      poseState.sampled = false;
      if (this.blendClock.remaining > 0) {
        // A partial terminal stride consumes only its matching simulation interval.
        this.nativeTransition.duration = this.blendClock.advance(
          animationSeconds / (this.playback.rate * nativeRate),
          animationSeconds
        );
      }
      this.animator.update(animationSeconds / nativeRate);
      this.correctRootMotion();
      this.sampledGait = fraction > 0 && poseState.sampled && this.readPose(true);
      if (poseState.finished) this.playback.elapsed = this.duration;
    }
    if (fraction > 0 && !this.sampledGait) this.blockedPoseSteps++;
    // Neither residual steering velocity nor a retained destination can bypass this gate.
    return this.sampledGait ? fraction : 0;
  }

  private acceptPreparedRoute(): void {
    if (this.preparedRoute) {
      this.route = this.preparedRoute;
      this.preparedRoute = undefined;
    }
    if (!this.route) return;
    this.continuationTarget = undefined;
    this.flightNeedsReplan = false;
    this.airSteering.continuous = this.groundSteering.continuous = this.route.cursor < this.route.points.length - 1;
  }

  /** Plan once per changed intent; gait repeats retain the same route and cursor. */
  private prepareRoute(
    target: readonly [number, number],
    nominalSpeed: number,
    medium: "ground" | "air" | "water",
    arrivalMedium?: "ground" | "water"
  ): boolean {
    if (!this.canOccupy(target[0], target[1], arrivalMedium ?? medium)) return false;
    const ground = this.options.ground;
    if (!ground?.staticRouteQuery) return true;
    const matches = (route: ConfiguredAnimal["route"]) =>
      route &&
      route.speed === nominalSpeed &&
      route.medium === medium &&
      route.arrivalMedium === arrivalMedium &&
      route.scale === this.scale &&
      route.multiplier === this.speedMultiplier &&
      route.points[route.points.length - 1][0] === target[0] &&
      route.points[route.points.length - 1][1] === target[1];
    if (matches(this.route)) {
      this.preparedRoute = undefined;
      return true;
    }
    const prepared = this.preparedRoute;
    if (
      matches(prepared) &&
      prepared!.preparedAt === this.system.time &&
      prepared!.from.x === this.motion.x &&
      prepared!.from.z === this.motion.z &&
      prepared!.from.heading === this.motion.heading &&
      prepared!.from.speed === this.motion.speed &&
      prepared!.from.angularSpeed === this.motion.angularSpeed &&
      prepared!.from.y === this.position.y
    )
      return true;
    this.preparedRoute = undefined;
    const speed = nominalSpeed * this.scale * this.speedMultiplier;
    const length = Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale);
    const steering = { ...(medium === "air" ? this.airSteering : this.surfaceSteering), continuous: false };
    const omega = Math.min(steering.maxAngularSpeed, speed / (length * 1.25));
    const passRadius = Math.max(0.2, speed / Math.max(0.05, omega));
    const radius = this.baseRadius * this.scale;
    const physicalQuery = ground.staticRouteQuery(radius + 0.05, medium);
    const traffic = this.crowdBody
      ? this.crowd!.routeQuery(
          this.crowdBody,
          ground.heightAt(this.motion.x, this.motion.z, medium) ?? this.position.y,
          medium
        )
      : undefined;
    const query: AnimalRouteQuery = traffic
      ? {
          canTraverse: (from, to, clearance) =>
            physicalQuery.canTraverse(from, to, clearance) && traffic.canTraverse(from, to),
          obstruction: (from, to, clearance) =>
            physicalQuery.canTraverse(from, to, clearance)
              ? traffic.obstruction(from, to, clearance)
              : physicalQuery.obstruction(from, to, clearance)
        }
      : physicalQuery;
    const points = planAnimalStaticRoute([this.motion.x, this.motion.z], target, query, passRadius * 2 + speed);
    if (!points) return false;
    const motion = { ...this.motion },
      proposed = { ...this.motion },
      forward = { ...this.motion },
      recovery = new GroundAnimalRecovery();
    let cursor = 0,
      y = this.position.y,
      totalDistance = 0,
      previous = [motion.x, motion.z];
    for (const point of points) {
      totalDistance += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      previous = [...point];
    }
    const budget = Math.ceil(
      (totalDistance / Math.max(0.1, speed * steering.turnSpeedRatio) +
        ((points.length + 1) * Math.PI * 2) / Math.max(0.05, omega) +
        3) *
        15
    );
    const bodyHeight = (this.config.bounds.max[1] - this.config.bounds.min[1]) * this.scale;
    for (let i = 0; i < Math.min(6000, budget); i++) {
      const nextCursor = advanceAnimalRouteTarget(motion, points, cursor, passRadius);
      if (cursor !== nextCursor) recovery.reset();
      cursor = nextCursor;
      steering.continuous = cursor < points.length - 1;
      const from = [motion.x, motion.z] as const;
      const oldY = y;
      Object.assign(proposed, motion);
      const arrived = advanceGroundAnimalMotion(proposed, points[cursor], speed, length, 1 / 15, speed, steering);
      const dx = points[cursor][0] - motion.x,
        dz = points[cursor][1] - motion.z;
      const proposedX = proposed.x,
        proposedZ = proposed.z;
      const supported = query.canTraverse(from, [proposedX, proposedZ]);
      const closeBehind =
        Math.hypot(dx, dz) < length * 1.5 && dx * Math.sin(motion.heading) + dz * Math.cos(motion.heading) < 0;
      if (medium !== "air" && !arrived && (recovery.recovering || !supported || closeBehind)) {
        Object.assign(forward, proposed);
        const recovered = recovery.advance(motion, proposed, speed, length, 1 / 15, (a, b) =>
          query.canTraverse([a.x, a.z], [b.x, b.z])
        );
        if (!recovered && supported) Object.assign(proposed, forward);
      }
      Object.assign(motion, proposed);
      // A clear waypoint chord does not guarantee a clear slow-turning arc.
      // Validate the actual planned curve against the same decision-time footprints.
      // The initial support check already validated this segment. Only recovery
      // can replace its endpoint during this synchronous preview step.
      if (
        !(motion.x === proposedX && motion.z === proposedZ ? supported : query.canTraverse(from, [motion.x, motion.z]))
      )
        return false;
      if (medium === "air" && ground.canTraverseAir) {
        let wanted = ground.heightAt(motion.x, motion.z, "air") ?? y;
        if (!steering.continuous && arrivalMedium) {
          const landing = ground.heightAt(target[0], target[1], arrivalMedium);
          if (!Number.isFinite(landing)) return false;
          const distance = Math.max(0, Math.hypot(target[0] - motion.x, target[1] - motion.z) - steering.arrivalRadius);
          wanted =
            landing! +
            (wanted - landing!) * Math.min(1, Math.max(0, distance - Math.max(1, speed)) / Math.max(4, speed * 2.5));
        }
        const maxStep = this.flightClimbSpeed / 15;
        y += Math.max(-maxStep, Math.min(maxStep, wanted - y));
        if (
          !ground.canTraverseAir(
            { x: from[0], z: from[1], y: oldY },
            { x: motion.x, z: motion.z, y },
            radius,
            bodyHeight
          )
        )
          return false;
      }
      if (arrived && !steering.continuous) {
        this.preparedRoute = {
          points,
          cursor: 0,
          passRadius,
          speed: nominalSpeed,
          medium,
          scale: this.scale,
          multiplier: this.speedMultiplier,
          arrivalMedium,
          preparedAt: this.system.time,
          from: { ...this.motion, y: this.position.y }
        };
        return true;
      }
    }
    return false;
  }

  private checkGroundPath(target: readonly [number, number], nominalSpeed: number): boolean {
    const ground = this.options.ground;
    if (!ground || ground.staticRouteQuery || this.movementMedium === "air") return true;
    const motion = this.groundPrediction,
      previous = this.groundCheckpoint;
    Object.assign(motion, this.motion);
    Object.assign(previous, motion);
    const speed = nominalSpeed * this.scale * this.speedMultiplier;
    const length = Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale);
    const radius = this.baseRadius * this.scale;
    // A preferred autonomous endpoint needs room for the next body-sized turn,
    // not merely a footprint that fits. This is one query per candidate, never per frame.
    previous.x = target[0];
    previous.z = target[1];
    if (
      !ground.canTraverse(
        previous,
        previous,
        radius + groundAnimalTurnClearance(length, speed, this.surfaceSteering),
        this.movementMedium
      )
    )
      return false;
    Object.assign(previous, motion);
    for (let frame = 0; frame < 180; frame++) {
      const arrived = advanceGroundAnimalMotion(motion, target, speed, length, 1 / 60, speed, this.surfaceSteering);
      if (frame === 0 || frame % 30 === 29 || arrived) {
        if (this.crowdBody && !this.crowd!.canOccupy(this.crowdBody, motion.x, motion.z)) return false;
        if (
          !Number.isFinite(ground.heightAt(motion.x, motion.z, this.movementMedium)) ||
          !ground.canTraverse(previous, motion, radius, this.movementMedium)
        ) {
          // An actor already facing outwards on an edge still needs the bounded
          // stepping recovery; rejecting every goal here would immobilize it.
          return frame === 0;
        }
        Object.assign(previous, motion);
      }
      if (arrived) return true;
    }
    return true;
  }

  /** Validate terrain and obstacles without changing movement state during route probes. */
  private canTranslate(
    proposed: Readonly<GroundAnimalMotion>,
    from: Readonly<GroundAnimalMotion> = this.motion
  ): boolean {
    const ground = this.options.ground;
    if (!ground || (proposed.x === from.x && proposed.z === from.z)) return true;
    if (
      (this.movementMedium !== "air" &&
        !Number.isFinite(ground.heightAt(proposed.x, proposed.z, this.movementMedium))) ||
      !(this.movementMedium === "air" && ground.flightBounds
        ? containsAnimalFlight(ground.flightBounds, proposed.x, proposed.z, this.baseRadius * this.scale)
        : ground.canTraverse(from, proposed, this.baseRadius * this.scale, this.movementMedium))
    )
      return false;
    if (this.movementMedium === "air" && ground.canTraverseAir) {
      const height = (this.config.bounds.max[1] - this.config.bounds.min[1]) * this.scale;
      return ground.canTraverseAir(
        { x: from.x, z: from.z, y: this.position.y },
        { x: proposed.x, z: proposed.z, y: this.position.y },
        this.baseRadius * this.scale,
        height
      );
    }
    return true;
  }

  private resolveGroundMotion(proposed: GroundAnimalMotion, seconds: number): boolean {
    const supported = this.canTranslate(proposed);
    if (this.movementMedium === "air" || this.velocity <= 0) return supported;
    const length = Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale);
    const dx = this.movementTarget[0] - this.motion.x,
      dz = this.movementTarget[1] - this.motion.z;
    const closeBehind =
      Math.hypot(dx, dz) < length * 1.5 && dx * Math.sin(this.motion.heading) + dz * Math.cos(this.motion.heading) < 0;
    if (!this.groundRecovery.recovering && supported && !closeBehind) return true;
    Object.assign(this.groundCheckpoint, proposed);
    const recovered = this.groundRecovery.advance(
      this.motion,
      proposed,
      this.velocity * this.scale * this.speedMultiplier,
      length,
      seconds,
      (from, to) => this.canTranslate(to, from)
    );
    if (!recovered && supported) Object.assign(proposed, this.groundCheckpoint);
    return recovered || supported;
  }

  /** Capture/compare local animated transforms without per-step arrays or world-matrix work. */
  private readPose(compare: boolean): boolean {
    let changed = false;
    for (let i = 0; i < this.poseTransforms.length; i++) {
      const transform = this.poseTransforms[i];
      const p = transform.position,
        q = transform.rotationQuaternion,
        s = transform.scale;
      const offset = i * 10;
      if (compare) {
        const before = this.poseBefore;
        changed ||=
          Math.abs(before[offset] - p.x) > 1e-7 ||
          Math.abs(before[offset + 1] - p.y) > 1e-7 ||
          Math.abs(before[offset + 2] - p.z) > 1e-7 ||
          Math.abs(before[offset + 3] - q.x) > 1e-7 ||
          Math.abs(before[offset + 4] - q.y) > 1e-7 ||
          Math.abs(before[offset + 5] - q.z) > 1e-7 ||
          Math.abs(before[offset + 6] - q.w) > 1e-7 ||
          Math.abs(before[offset + 7] - s.x) > 1e-7 ||
          Math.abs(before[offset + 8] - s.y) > 1e-7 ||
          Math.abs(before[offset + 9] - s.z) > 1e-7;
        if (changed) return true;
      } else {
        const before = this.poseBefore;
        before[offset] = p.x;
        before[offset + 1] = p.y;
        before[offset + 2] = p.z;
        before[offset + 3] = q.x;
        before[offset + 4] = q.y;
        before[offset + 5] = q.z;
        before[offset + 6] = q.w;
        before[offset + 7] = s.x;
        before[offset + 8] = s.y;
        before[offset + 9] = s.z;
      }
    }
    return changed;
  }

  /** Shared support/approach target for actual elevation and newly accepted movement predictions. */
  private targetElevation(): number {
    const sampled = this.options.ground?.heightAt(this.motion.x, this.motion.z, this.movementMedium);
    let height = Number.isFinite(sampled)
      ? sampled! - (this.movementMedium === "water" ? (this.config.waterline ?? 0) * this.scale : 0)
      : this.root.transform.position.y;
    if (
      this.arrivalHeight !== undefined &&
      !this.continuationTarget &&
      !(this.route && this.route.cursor < this.route.points.length - 1)
    ) {
      const distance = Math.max(
        0,
        Math.hypot(this.destination[0] - this.motion.x, this.destination[1] - this.motion.z) -
          (this.config.flightSteering?.arrivalRadius ?? 0.06)
      );
      const support =
        distance === 0 ? this.options.ground?.heightAt(this.motion.x, this.motion.z, this.arrivalMedium) : undefined;
      if (distance === 0 && support !== undefined)
        this.arrivalHeight = support - (this.arrivalMedium === "water" ? (this.config.waterline ?? 0) * this.scale : 0);
      // Complete the descent before horizontal braking reaches the arrival disk.
      const cruise = this.velocity * this.scale * this.speedMultiplier;
      const approach = Math.min(1, Math.max(0, distance - Math.max(1, cruise)) / Math.max(4, cruise * 2.5));
      height = this.arrivalHeight + (height - this.arrivalHeight) * approach;
    }
    return height;
  }

  private get flightClimbSpeed(): number {
    return Math.max(2, (this.config.bounds.max[1] - this.config.bounds.min[1]) * this.scale * 2);
  }

  private placeOnGround(seconds = Infinity, distant = false): void {
    const height = this.targetElevation();
    const current = this.root.transform.position.y;
    const step =
      (this.changingMedium || this.movementMedium === "air") && Number.isFinite(seconds)
        ? (distant || this.sampledAnimationSeconds > 0) && !this.manual
          ? this.flightClimbSpeed * seconds
          : 0
        : Infinity;
    let y = current + Math.max(-step, Math.min(step, height - current));
    if (
      !distant &&
      (this.changingMedium || this.movementMedium === "air") &&
      this.crowdBody &&
      !this.crowd!.canSetElevation(this.crowdBody, y)
    ) {
      y = current;
      if (this.arrivalHeight !== undefined) this.surfaceBlocked = true;
    }
    if (
      y !== current &&
      this.movementMedium === "air" &&
      this.options.ground?.canTraverseAir &&
      !this.options.ground.canTraverseAir(
        { x: this.motion.x, z: this.motion.z, y: current },
        { x: this.motion.x, z: this.motion.z, y },
        this.baseRadius * this.scale,
        (this.config.bounds.max[1] - this.config.bounds.min[1]) * this.scale
      )
    ) {
      y = current;
      this.surfaceBlocked = true;
    }
    if (Math.abs(y - height) < 1e-5) {
      this.changingMedium = false;
      if (this.crowdBody) this.crowdBody.layer = this.movementMedium;
    }
    this.root.transform.setPosition(this.motion.x, y, this.motion.z);
    if (this.crowdBody) {
      this.crowdBody.elevation = y;
      this.crowdBody.height = (this.config.bounds.max[1] - this.config.bounds.min[1]) * this.scale;
    }
  }

  private hasArrivedVertically(): boolean {
    if (this.continuationTarget || (this.route && this.route.cursor < this.route.points.length - 1)) return false;
    if (this.arrivalHeight === undefined) return true;
    if (
      (this.options.ground &&
        !this.options.ground.canTraverse(this.motion, this.motion, this.baseRadius * this.scale, this.arrivalMedium)) ||
      (this.crowdBody &&
        !this.crowd!.canOccupy(this.crowdBody, this.motion.x, this.motion.z, this.arrivalHeight, this.arrivalMedium))
    ) {
      this.surfaceBlocked = true;
      return false;
    }
    return Math.abs(this.position.y - this.arrivalHeight) < 0.03;
  }

  /** Cheap live guidance. No future motion integration or swept air/terrain route queries. */
  private probeMovementPath(): void {
    if (this.route) {
      const cursor = advanceAnimalRouteTarget(this.motion, this.route.points, this.route.cursor, this.route.passRadius);
      if (cursor !== this.route.cursor) {
        this.route.cursor = cursor;
        this.airSteering.continuous = this.groundSteering.continuous = cursor < this.route.points.length - 1;
        this.updateCrowdIntent();
      }
      // The accepted route already includes bounds, static clearance and its final approach.
      return;
    }
    if (this.manual || this.movementMedium !== "air" || !this.arrivalMedium || this.velocity <= 0) return;
    const cruise = this.velocity * this.scale * this.speedMultiplier;
    const dx = this.movementTarget[0] - this.motion.x,
      dz = this.movementTarget[1] - this.motion.z;
    const distance = Math.hypot(dx, dz);
    // An aligned, braking final approach may finish close to the boundary; it
    // must not be diverted back into cruise solely because cruise turn radius is large.
    const approaching =
      !this.continuationTarget &&
      distance < cruise * 3 &&
      dx * Math.sin(this.motion.heading) + dz * Math.cos(this.motion.heading) > distance * 0.99;
    const bounds = this.options.ground?.flightBounds;
    const inward =
      !approaching && bounds
        ? animalFlightBoundaryHeading(
            bounds,
            this.motion,
            cruise,
            this.airSteering.maxAngularSpeed,
            this.baseRadius * this.scale
          )
        : undefined;
    if (inward !== undefined || this.continuationTarget) {
      this.continueFlight(inward);
      return;
    }
    // No terrain/landing queries while crossing the map. Check the resting footprint only
    // when approaching it; actual touchdown validates the current footprint too.
    if (distance > Math.max(cruise, this.motion.speed) * 3 + this.airSteering.arrivalRadius) return;
    if (this.system.time >= this.nextFlightProbe) {
      this.nextFlightProbe = this.system.time + 0.25;
      if (!this.checkFlightPath(this.destination, this.velocity, this.arrivalMedium, true)) {
        this.continueFlight();
        return;
      }
    }
    if (distance < this.airSteering.arrivalRadius + Math.max(1, cruise * 0.3) && !this.hasArrivedVertically())
      this.continueFlight();
  }

  private get movementTarget(): readonly [number, number] {
    return (
      this.route?.points[this.route.cursor] ??
      (this.movementMedium === "air" ? (this.continuationTarget ?? this.destination) : this.destination)
    );
  }

  /** Keep a forward gait while one pending task searches for another supported landing. */
  private continueFlight(inward?: number): void {
    if (this.movementMedium !== "air" || this.velocity <= 0) return;
    this.flightNeedsReplan = true;
    this.airSteering.continuous = true;
    const cruise = this.velocity * this.scale * this.speedMultiplier;
    const distance = Math.max(5, cruise * (3 + 2 / this.airSteering.maxAngularSpeed));
    const angle = inward ?? this.motion.heading;
    const target = (this.continuationTarget ??= [...this.destination]);
    target[0] = this.motion.x + Math.sin(angle) * distance;
    target[1] = this.motion.z + Math.cos(angle) * distance;
    this.updateCrowdIntent();
    // A render step is not a decision event. Recovery owns only one bounded wake;
    // failed target searches retain the live motion until their shared retry deadline.
    if (this.system.time >= this.nextFlightProbe) {
      this.nextFlightProbe = this.system.time + 0.25;
      this.system.requestWake(this);
    }
  }

  private checkFlightPath(
    target: readonly [number, number],
    speed: number,
    arrivalMedium: "ground" | "water",
    approaching = false
  ): boolean {
    const ground = this.options.ground;
    if (!ground) return true;
    this.flightPathChecks++;
    const cruise = speed * this.scale * this.speedMultiplier;
    const distance = Math.hypot(target[0] - this.motion.x, target[1] - this.motion.z);
    const endpoint = { ...this.motion, x: target[0], z: target[1] };
    const landing = ground.heightAt(target[0], target[1], arrivalMedium);
    if (
      !Number.isFinite(landing) ||
      !this.canOccupy(target[0], target[1], arrivalMedium) ||
      !ground.canTraverse(endpoint, endpoint, this.baseRadius * this.scale, arrivalMedium)
    )
      return false;
    if (!approaching) {
      if (
        !animalFlightApproachFits(
          this.motion,
          target,
          cruise,
          this.airSteering.maxAngularSpeed,
          this.airSteering.turnSpeedRatio
        )
      )
        return false;
      const verticalSpeed = this.flightClimbSpeed;
      if (distance < (Math.max(0, this.position.y - landing!) / verticalSpeed) * cruise * 1.5) return false;
      // Grounded takeoff cannot instantly reverse away from a map edge. Let the
      // existing ground fallback turn/step first, then retry with a viable heading.
      if (
        ground.flightBounds &&
        animalFlightBoundaryHeading(
          ground.flightBounds,
          this.motion,
          cruise,
          this.airSteering.maxAngularSpeed,
          this.baseRadius * this.scale
        ) !== undefined
      )
        return false;
      this.lastFlightPlan = { from: { ...this.motion }, target: [...target], cruise, time: this.system.time };
    }
    return true;
  }

  /** Use the shared local spatial index to avoid selecting an already occupied destination. */
  canOccupy(x: number, z: number, medium = this.movementMedium): boolean {
    const y = this.options.ground?.heightAt(x, z, medium) ?? this.position.y;
    if (!this.crowdBody) return true;
    return this.crowd!.canReserve(this.crowdBody, x, z, y, medium);
  }

  /** Current presentation/movement domain selected by the registered action. */
  get medium(): "ground" | "air" | "water" {
    return this.movementMedium;
  }

  /** Native scene entity; its resources remain borrowed from the shared model asset. */
  get entity(): Entity {
    return this.root;
  }

  /** Hide and suspend simulation while retaining identity, pose and shared asset ownership. */
  setVisible(visible: boolean): void {
    this.setStreamingState(visible, visible);
  }

  /**
   * Select presentation and motion precision. Hidden autonomy keeps the same tasks and clock.
   * @param visible Whether to render; rendering requires full simulation.
   * @param simulate Whether to sample bones and solve dynamic avoidance continuously.
   * @param continueAutonomy Whether a hidden instance keeps its tasks at coarse motion precision.
   */
  setStreamingState(visible: boolean, simulate: boolean, continueAutonomy = false): void {
    if (this.disposed) return;
    if (visible && !simulate) throw new Error("A visible animal must simulate");
    if (!this.hasPresentation) {
      continueAutonomy ||= simulate;
      visible = false;
      simulate = false;
    }
    if (this.rendered !== visible) {
      this.rendered = visible;
      this.renderers.forEach((renderer, i) => {
        renderer.enabled = visible && this.rendererEnabled[i];
      });
    }
    const coarse = !simulate && continueAutonomy && !this.manual;
    if (this.active === simulate && this.distant === coarse && this.suspended === !(simulate || coarse)) return;
    this.system.synchronizeMotion(this);
    this.synchronizeRestAnimation();
    this.cancelAnimationDeadline?.();
    this.cancelAnimationDeadline = undefined;
    this.restAnimationAt = undefined;
    const enabled = !this.suspended;
    this.distant = coarse;
    if (coarse) this.deferredClip = this.clip;
    if (enabled !== (simulate || coarse)) this.system.setActive(this, simulate || coarse);
    else this.setActive(simulate || coarse);
    this.system.setMotionInterval(this, coarse ? (this.options.distantUpdateSeconds ?? 1) : 0);
    this.system.setMoving(this, simulate || (coarse && this.velocity > 0));
    this.scheduleRestAnimation();
  }

  /** @internal Pause presentation independently from the shared logical clock. */
  setActive(enabled: boolean): void {
    this.nextFlightProbe = 0;
    if (!enabled) {
      this.synchronizeRestAnimation();
      this.restAnimationAt = undefined;
    } else if (this.suspended && this.distant && this.velocity <= 0 && this.finishAnimation) {
      this.restAnimationAt = this.system.time;
    }
    this.suspended = !enabled;
    this.active = enabled && !this.distant;
    this.root.isActive = this.active;
    if (this.crowdBody) {
      const { speed, angularSpeed } = this.motion;
      this.crowd!.setActive(this.crowdBody, this.active);
      // Suspending crowd solving changes precision, not the ongoing movement.
      if (enabled) {
        this.motion.speed = speed;
        this.motion.angularSpeed = angularSpeed;
      }
    }
    if (!enabled) this.motion.speed = this.motion.angularSpeed = 0;
    else if (this.active && this.deferredClip !== undefined) {
      const index = this.deferredClip,
        elapsed = this.playback.elapsed,
        finish = this.finishAnimation;
      this.deferredClip = undefined;
      this.selectClip(index);
      this.seek(elapsed);
      this.finishAnimation = finish;
    }
    this.updateCrowdIntent();
  }

  /** Whether this instance uses coarse motion; unrelated to species or current action. */
  get hasDistantActivity(): boolean {
    return !this.disposed && !this.suspended && this.distant && !this.active;
  }

  /** Conservative displacement since the last shared motion sample, for visibility admission. */
  get pendingTravelBound(): number {
    return Math.max(this.motion.speed, this.velocity * this.scale * this.speedMultiplier) * this.system.motionLag(this);
  }

  private reportMovementEffort(): void {
    this.behavior.updateMovementEffort(
      Math.hypot(
        this.motion.speed,
        this.motion.angularSpeed *
          Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale) *
          0.35
      ) /
        (this.scale * this.speedMultiplier)
    );
  }

  private advanceCoarseMotion(seconds: number): void {
    if (this.velocity <= 0) return;
    this.distantActivityUpdates++;
    this.surfaceBlocked = false;
    if (this.movementMedium === "air") this.distantFlightUpdates++;
    const length = Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale);
    let remaining = seconds,
      verticalElapsed = 0,
      arrived = false;
    while (remaining > 1e-8) {
      let speed = this.velocity * this.scale * this.speedMultiplier;
      // Split at animation boundaries too: an old clip cannot consume the next clip's time.
      const step = Math.min(
        remaining,
        0.1,
        Math.max(1e-7, (this.duration - this.playback.elapsed) / Math.max(0.01, this.playback.rate))
      );
      remaining -= step;
      this.probeMovementPath();
      speed = this.velocity * this.scale * this.speedMultiplier;
      Object.assign(this.proposedMotion, this.motion);
      arrived = advanceGroundAnimalMotion(
        this.proposedMotion,
        this.movementTarget,
        speed,
        length,
        step,
        speed,
        this.movementMedium === "air" ? this.airSteering : this.surfaceSteering
      );
      if (!(arrived ? this.canTranslate(this.proposedMotion) : this.resolveGroundMotion(this.proposedMotion, step))) {
        this.velocity = this.motion.speed = this.motion.angularSpeed = 0;
        const finish = this.finishMove;
        this.finishMove = undefined;
        finish?.(false);
        break;
      }
      const fraction = this.playback.prepare(step, this.proposedMotion, length);
      this.playback.advance();
      if (fraction > 0) {
        this.motion.x += (this.proposedMotion.x - this.motion.x) * fraction;
        this.motion.z += (this.proposedMotion.z - this.motion.z) * fraction;
        this.motion.heading += (this.proposedMotion.heading - this.motion.heading) * fraction;
        this.motion.speed = this.proposedMotion.speed;
        this.motion.angularSpeed = this.proposedMotion.angularSpeed;
      }
      verticalElapsed += step;
      // Cruise elevation is sampled once per coarse update. Only the final descent
      // needs per-step height integration to stay synchronized with horizontal braking.
      if (
        this.movementMedium === "air" &&
        !this.continuationTarget &&
        Math.hypot(this.destination[0] - this.motion.x, this.destination[1] - this.motion.z) < Math.max(4, speed * 4)
      ) {
        this.placeOnGround(verticalElapsed, true);
        verticalElapsed = 0;
      }
      if (arrived && fraction === 1) break;
      arrived = false;
      this.completeAnimation();
      if (this.velocity <= 0 || !this.finishAnimation) break;
    }
    this.root.transform.setRotation(0, (this.motion.heading * 180) / Math.PI, 0);
    this.presentedHeading = this.motion.heading;
    if (verticalElapsed > 0) this.placeOnGround(verticalElapsed, true);
    if (this.crowdBody) this.crowd!.synchronizeDormantPosition(this.crowdBody);
    if (
      (arrived || (this.velocity > 0 && this.options.arrivedAtInteraction?.(this.destination))) &&
      this.hasArrivedVertically()
    ) {
      this.completeMovement();
      if (this.crowdBody) this.crowdBody.layer = this.movementMedium;
    } else if (arrived && this.surfaceBlocked) {
      this.continueFlight();
    }
    this.settlePendingRest();
    this.completeAnimation();
    this.reportMovementEffort();
    this.system.setMoving(this, this.velocity > 0);
    this.scheduleRestAnimation();
  }

  /** Whether this actor is admitted by the host visibility policy. */
  get visible(): boolean {
    return this.active && this.rendered;
  }

  private completeMovement(): void {
    this.route = undefined;
    this.preparedRoute = undefined;
    if (this.crowdBody) this.crowd!.release(this.crowdBody);
    this.groundRecovery.reset();
    this.velocity = 0;
    this.motion.speed = this.motion.angularSpeed = 0;
    this.updateCrowdIntent();
    const finish = this.finishMove;
    this.finishMove = undefined;
    finish?.(true);
  }

  /** Set the instance's calibration while preserving its simulation position. */
  setScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0) throw new Error("Scale must be positive");
    if (this.crowdBody && scale !== this.scale && !this.crowd!.canResize(this.crowdBody, this.baseRadius * scale))
      throw new Error("放大后会与附近动物重叠，请先移动到空旷处");
    if (this.scale !== scale) this.nextFlightProbe = 0;
    const previousScale = this.scale;
    this.scale = scale;
    if (
      scale !== previousScale &&
      this.route &&
      !this.prepareRoute(this.destination, this.velocity, this.movementMedium, this.arrivalMedium)
    ) {
      this.scale = previousScale;
      throw new Error("当前路线无法容纳这个体型，请先选择空旷位置");
    }
    if (scale !== previousScale) this.acceptPreparedRoute();
    if (this.crowdBody) {
      this.crowdBody.radius = this.baseRadius * scale;
      this.crowdBody.bodyLength = Math.max(0.1, (this.config.bounds.max[2] - this.config.bounds.min[2]) * scale);
      this.updateCrowdIntent();
    }
    this.applyCalibration();
  }

  /** Applying a clip's visual offset cannot resize collision or re-admit an ongoing route. */
  private applyCalibration(): void {
    const scale = this.scale;
    this.calibration.transform.setScale(scale, scale, scale);
    this.calibration.transform.setRotation(0, this.config.yaw ?? 0, 0);
    const bounds = this.config.animations.find((binding) => binding.id === this.config.initialAnimation)!.bounds;
    const center = new Vector3(
      -(bounds.min[0] + bounds.max[0]) / 2,
      // Animated envelopes include crouches and belly motion; they are not a support plane.
      -this.config.bounds.min[1],
      -(bounds.min[2] + bounds.max[2]) / 2
    );
    // Translation precedes the heading correction, keeping imported origins independent of actor placement.
    const radians = ((this.config.yaw ?? 0) * Math.PI) / 180;
    this.calibration.transform.setPosition(
      (center.x * Math.cos(radians) + center.z * Math.sin(radians)) * scale,
      center.y * scale + (this.config.animations[this.clip]?.altitude ?? 0),
      (-center.x * Math.sin(radians) + center.z * Math.cos(radians)) * scale
    );
  }

  /** Adjust nominal translation for visual foot-slip calibration; the gait remains coupled to actual motion. */
  setMovementMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Movement multiplier must be positive");
    if (this.speedMultiplier === multiplier) return;
    if (this.speedMultiplier !== multiplier) this.nextFlightProbe = 0;
    const previous = this.speedMultiplier;
    this.speedMultiplier = multiplier;
    if (this.route && !this.prepareRoute(this.destination, this.velocity, this.movementMedium, this.arrivalMedium)) {
      this.speedMultiplier = previous;
      throw new Error("当前路线无法安全保持这个速度，请先更换目标");
    }
    this.acceptPreparedRoute();
    this.updateCrowdIntent();
  }

  /** Instance translation multiplier, independent of shared clip bindings. */
  get movementMultiplier(): number {
    return this.speedMultiplier;
  }

  /** Current scene-space translational speed after turn and acceleration limits. */
  get movementSpeed(): number {
    return this.motion.speed;
  }

  /** Ground heading in radians, for forward-biased wandering queries. */
  get direction(): number {
    return this.motion.heading;
  }

  /** Current angular speed in radians/second, for visual movement diagnostics. */
  get angularSpeed(): number {
    return this.motion.angularSpeed;
  }

  /** Gait playback multiplier coupled to translation and turning. */
  get animationRate(): number {
    return this.playback.rate;
  }

  /** Cumulative invariant audit: every moving/turning step must advance a tree-selected gait. */
  get motionSync() {
    return {
      distantFlightUpdates: this.distantFlightUpdates,
      distantActivityUpdates: this.distantActivityUpdates,
      locomotionSteps: this.locomotionSteps,
      unsupportedMotionSteps: this.unsupportedMotionSteps,
      blockedPoseSteps: this.blockedPoseSteps,
      nativeAnimation: this.nativeAnimation,
      nativeTargetState: this.activeState?.name ?? null,
      crossfades: this.crossfadeCount,
      directPlays: this.directPlayCount,
      blendSeconds: this.lastBlendSeconds,
      blendRemainingSeconds: this.blendClock.remaining,
      landings: this.landings,
      flightReplans: this.flightReplans,
      flightPathChecks: this.flightPathChecks,
      lastFlightPlan: this.lastFlightPlan,
      longestAirPause: { ...this.longestAirPause },
      longestStationaryAirSeconds: this.longestStationaryAirSeconds,
      peakNormalSpeed: this.peakNormalSpeed,
      peakRaisedPaceSpeed: this.peakRaisedPaceSpeed,
      maxTurnDegreesPerSecond: (this.maxTurnRadiansPerSecond * 180) / Math.PI
    };
  }

  /** Enable the optional extra shadow pass for this preview instance. */
  setShadows(enabled: boolean): void {
    this.shadowsEnabled = enabled;
    for (const renderer of this.renderers) renderer.castShadows = renderer.receiveShadows = enabled;
  }

  /** Enter manual inspection for this instance; other animals keep their behavior trees running. */
  play(index: number): void {
    this.behavior.suspend();
    this.manual = true;
    this.urgentMovement = false;
    this.continuationTarget = undefined;
    this.route = undefined;
    this.preparedRoute = undefined;
    if (this.crowdBody) this.crowd!.release(this.crowdBody);
    this.airSteering.continuous = false;
    this.flightNeedsReplan = false;
    this.arrivalHeight = undefined;
    this.arrivalMedium = undefined;
    this.actionPace = 1;
    this.locomotionSpeed = 0;
    this.velocity = 0;
    this.updateCrowdIntent();
    this.selectClip(index, true);
    this.system.setMoving(this, true);
  }

  /**
   * Move to a host-approved spawn/inspection point and hold the initial pose.
   * Collision and finite ground height are checked before cancelling the current task.
   * The host selects habitat/support; no traversal path is required for this instantaneous placement.
   */
  relocate(position: readonly [number, number], heading = this.direction): boolean {
    const [x, z] = position;
    if (this.disposed || ![x, z, heading].every(Number.isFinite)) return false;
    if (this.options.ground && !Number.isFinite(this.options.ground.heightAt(x, z, this.movementMedium))) return false;
    if (!this.canOccupy(x, z)) return false;
    if (this.crowdBody && !this.crowd!.relocate(this.crowdBody, x, z, heading)) return false;
    Object.assign(this.motion, { x, z, heading, speed: 0, angularSpeed: 0 });
    this.destination[0] = x;
    this.destination[1] = z;
    // The crowd clears its old intent; restore this actor's live destination binding.
    if (this.crowdBody) this.crowdBody.target = this.destination;
    this.presentedHeading = heading;
    this.groundRecovery.reset();
    this.surfaceBlocked = this.wasBlocked = false;
    const idle =
      this.profile.animationSlots.idle?.find((choice) => (choice.medium ?? "ground") === this.movementMedium)?.clip ??
      this.config.initialAnimation;
    this.play(this.config.animations.findIndex((clip) => clip.id === idle));
    this.seek(0);
    this.root.transform.setRotation(0, (heading * 180) / Math.PI, 0);
    this.placeOnGround();
    return true;
  }

  /** Return this instance to its configured behavior tree. */
  resumeBehavior(): void {
    this.execute({ requestId: `idle-${this.system.time}`, skillId: "idle" });
  }

  /** Submit a semantic task from either UI or a tool adapter, leaving manual animation inspection. */
  execute(request: AnimalTaskRequest) {
    const receipt = this.behavior.execute(request);
    if (receipt.status !== "rejected") this.manual = false;
    return receipt;
  }

  /** Seek within the configured slice, including while the shared scene is paused. */
  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) throw new Error("Animation time must be finite");
    this.playback.elapsed = Math.max(0, Math.min(seconds, this.duration - 0.0001));
    const binding = this.config.animations[this.clip];
    const sourceEnd = binding.range?.[1] ?? this.duration;
    // This engine's Animator.play offset is relative to the source end time, even for slices.
    this.directPlayCount++;
    this.lastBlendSeconds = 0;
    this.blendClock.start(0);
    if (!this.animator || !this.activeState) return;
    this.animator.play(this.activeState.name, 0, this.playback.elapsed / sourceEnd);
    this.clipStartedFrame = this.root.engine.time.frameCount;
    this.animator.update(0);
    this.correctRootMotion();
  }

  /** Current slice duration in seconds. */
  get duration(): number {
    return this.durations[this.clip];
  }
  /** Current slice time in seconds. */
  get time(): number {
    return this.restAnimationAt === undefined
      ? this.playback.elapsed
      : Math.min(this.duration, this.playback.elapsed + (this.system.time - this.restAnimationAt) * this.playback.rate);
  }
  /** Selected configured animation index. */
  get animationIndex(): number {
    return this.deferredClip ?? this.clip;
  }
  /** Whether this instance follows its configured tree. */
  get automatic(): boolean {
    return !this.manual;
  }
  /** Visible action name; unclassified clips keep their original names. */
  get action(): string {
    const binding = this.config.animations[this.animationIndex];
    return binding.label ?? binding.clip;
  }
  /** Current actor position, independent of source model transforms. */
  get position(): Readonly<Vector3> {
    return this.root.transform.position;
  }
  /** Current sampled envelope transformed into scene space for framing. */
  get bounds(): [number[], number[]] {
    const bounds = this.config.animations[this.clip].bounds;
    const points: Vector3[] = [];
    for (const x of [bounds.min[0], bounds.max[0]])
      for (const y of [bounds.min[1], bounds.max[1]])
        for (const z of [bounds.min[2], bounds.max[2]]) {
          const point = new Vector3(x, y, z);
          Vector3.transformCoordinate(point, this.calibration.transform.worldMatrix, point);
          points.push(point);
        }
    return [
      [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y)), Math.min(...points.map((p) => p.z))],
      [Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y)), Math.max(...points.map((p) => p.z))]
    ];
  }

  /** On-demand native renderer evidence for host inspection; does not drive behavior. */
  get presentation() {
    return this.renderers.map((renderer) => ({
      name: renderer.entity.name,
      active: renderer.entity.isActiveInHierarchy,
      enabled: renderer.enabled,
      castShadows: renderer.castShadows,
      receiveShadows: renderer.receiveShadows,
      materials: renderer.getMaterials().map(
        (material) =>
          material && {
            name: material.name,
            shading: material instanceof PBRMaterial ? "PBR" : material.shader.name,
            ...(material instanceof PBRMaterial ? { roughness: material.roughness, metallic: material.metallic } : {})
          }
      ),
      min: [renderer.bounds.min.x, renderer.bounds.min.y, renderer.bounds.min.z],
      max: [renderer.bounds.max.x, renderer.bounds.max.y, renderer.bounds.max.z]
    }));
  }

  /** Unregister deadlines, behavior and instance resources; leave borrowed GLBs alive. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.behavior?.dispose();
    this.system.remove(this);
    if (this.crowdBody) this.crowd?.remove(this.crowdBody);
    this.root.destroy();
    this.controller?.destroy();
    for (const material of this.ownedMaterials) material.destroy();
    this.ownedMaterials.clear();
  }

  /** Current conservative footprint and traffic state for inspection. */
  get traffic() {
    return {
      radius: this.crowdBody?.radius,
      blocked: this.crowdBody?.blocked ?? false,
      surfaceBlocked: this.surfaceBlocked
    };
  }

  private get surfaceSteering() {
    const precision = this.options.interactionArrivalRadius?.(this.destination);
    this.groundSteering.urgent = this.urgentMovement;
    this.groundSteering.maxAngularSpeed = this.urgentMovement ? 2.4 : 0.3;
    this.groundSteering.turnSpeedRatio = this.urgentMovement ? 0.65 : 0.5;
    this.groundSteering.arrivalRadius =
      precision ?? groundAnimalArrivalRadius((this.config.bounds.max[2] - this.config.bounds.min[2]) * this.scale);
    return this.groundSteering;
  }

  private updateCrowdIntent(): void {
    this.playback.setSpeed(this.locomotionSpeed * this.scale * this.speedMultiplier, this.baseAnimationRate);
    if (this.crowdBody) {
      this.crowdBody.target = this.movementTarget;
      this.crowdBody.desiredSpeed = this.active ? this.velocity * this.scale * this.speedMultiplier : 0;
      this.crowdBody.steering = this.movementMedium === "air" ? this.airSteering : this.surfaceSteering;
      this.crowd!.publishIntent(this.crowdBody);
      // A new waypoint can clear blocking between simulation steps. Observe that
      // edge now, otherwise re-blocking next step looks unchanged and loses the idle wake.
      this.wakeForTrafficChange();
    }
  }

  private wakeForTrafficChange(): void {
    if (this.crowdBody && this.wasBlocked !== this.crowdBody.blocked) {
      this.wasBlocked = this.crowdBody.blocked;
      this.system.requestWake(this);
    }
  }

  private get baseAnimationRate(): number {
    const binding = this.config.animations[this.clip];
    return (
      (binding?.playbackRate ?? 1) * (binding?.cadence === "time" ? Math.max(1, this.actionPace) : this.actionPace)
    );
  }

  private selectClip(index: number, blend = false): void {
    if (!this.config.animations[index]) throw new Error("Unknown configured animation");
    const previous = this.clip;
    // A tree-selected repeat at the natural end continues an authored stride.
    // Blending from its held endpoint flattens the next stride (especially a
    // half-second run). Interruptions and genuinely different actions still fade.
    const continuingGait =
      blend && previous === index && this.locomotionSpeed > 0 && this.playback.elapsed >= this.duration;
    this.cancelAnimationDeadline?.();
    this.cancelAnimationDeadline = undefined;
    this.restAnimationAt = undefined;
    this.finishAnimation = undefined;
    this.clip = index;
    const animation = this.config.animations[index];
    this.playback.start(
      this.duration,
      this.locomotionSpeed * this.scale * this.speedMultiplier,
      animation.cadence,
      this.baseAnimationRate
    );
    if (!this.active || !this.animator) {
      this.setScale(this.scale);
      this.deferredClip = index;
      return;
    }
    const transition = blend && previous >= 0 && !continuingGait;
    const sourceName = this.animator.getCurrentAnimatorState(0)?.name;
    const next =
      transition || continuingGait
        ? this.nativeStates[index].find((state) => state.name !== sourceName && state !== this.activeState)!
        : this.nativeStates[index][0];
    this.activeState = next;
    next.pose.finished = false;
    const blendSeconds = continuingGait
      ? Math.max(this.gaitSeams[index], this.blendClock.remaining)
      : transition
        ? Math.min(
            animation.transitionSeconds ?? this.config.transitionSeconds ?? 1,
            this.urgentMovement ? 0.12 : Infinity
          )
        : 0;
    this.lastBlendSeconds = blendSeconds;
    this.blendClock.start(blendSeconds);
    // One-use transitions do not call Animator.play and can advance immediately.
    // A render-frame hold here would brake every remaining simulation substep
    // whenever steering changes between run and walk.
    this.clipStartedFrame = continuingGait || transition ? -1 : this.root.engine.time.frameCount;
    this.model.transform.setPosition(0, 0, 0);
    if (continuingGait || transition) {
      // A one-use native transition, armed only after the move action chooses
      // this next clip. Unlike play(), this does not zero the rest of the render
      // frame's simulation substeps. No Loop mode or permanent auto-transition.
      const machine = this.controller.layers[0].stateMachine;
      // AnyState also interrupts an unfinished fade when a short one-shot ends.
      // A source-state transition would be ignored while the native layer is fading.
      const handoff = (this.nativeTransition = new AnimatorStateTransition());
      handoff.duration = blendSeconds;
      handoff.isFixedDuration = true;
      handoff.destinationState = machine.findStateByName(next.name)!;
      handoff.hasExitTime = false;
      machine.addAnyStateTransition(handoff);
      try {
        this.animator.update(0);
      } finally {
        machine.removeAnyStateTransition(handoff);
      }
      if (transition) this.crossfadeCount++;
    } else {
      this.directPlayCount++;
      this.animator.play(next.name, 0);
    }
    this.animator.update(0);
    if (this.anchor) this.readAnchor(this.anchorReference);
    this.updateCrowdIntent();
    this.applyCalibration();
  }

  private get nativeAnimation(): string | null {
    const name = this.animator?.getCurrentAnimatorState(0)?.name;
    const index = name === undefined ? undefined : this.nativeClipIndices.get(name);
    return index === undefined ? null : this.config.animations[index].id;
  }

  private readAnchor(out: Vector3): void {
    Matrix.invert(this.calibration.transform.worldMatrix, this.inverse);
    Vector3.transformCoordinate(this.anchor!.transform.worldPosition, this.inverse, out);
  }

  private correctRootMotion(): void {
    if (!this.anchor) return;
    this.model.transform.setPosition(0, 0, 0);
    this.readAnchor(this.anchorPosition);
    this.model.transform.setPosition(
      this.anchorReference.x - this.anchorPosition.x,
      0,
      this.anchorReference.z - this.anchorPosition.z
    );
  }
}
