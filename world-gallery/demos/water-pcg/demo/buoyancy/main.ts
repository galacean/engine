/** Standalone Galacean + PhysX validation page for water-pcg Pontoon buoyancy. */
import {
  BlinnPhongMaterial,
  BoxColliderShape,
  Camera,
  Color,
  DirectLight,
  DynamicCollider,
  DynamicColliderConstraints,
  Entity,
  MeshRenderer,
  ModelMesh,
  PlaneColliderShape,
  PhysicsMaterial,
  PrimitiveMesh,
  Script,
  StaticCollider,
  Vector3,
  WebGLEngine,
  WebGLMode,
  type Engine
} from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { RiverChunkSourceKind } from "../../compiler/river/RiverGeometryEnums";
import { WaterDecorationStyle } from "../decoration/constants";
import { RiverBedController } from "../decoration/RiverBedController";
import { curvedMainRiverExample } from "../examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../examples/river/multiTributaryRiver";
import { WaterBuoyancy } from "../../runtime/buoyancy/WaterBuoyancy";
import { createWaterSurfaceSample, type WaterSurfaceProvider } from "../../runtime/query/WaterSurfaceProvider";
import { RiverCompileWorkerClient } from "../../runtime/river/RiverCompileWorkerClient";
import { createRiverNetworkQueryResult } from "../../runtime/river/RiverQueryService";
import { RiverRuntimeController } from "../../runtime/river/RiverRuntimeController";
import { RiverWaterSurfaceProvider } from "../../runtime/river/RiverWaterSurfaceProvider";
import { createWaterPreviewMaterial } from "../WaterPreviewMaterial";
import { BuoyancyDebugView } from "./BuoyancyDebugView";
import {
  RiverDriftSpawner,
  type RiverDriftDestroyReason,
  type RiverDriftInstanceSnapshot,
  type RiverDriftVectorSnapshot
} from "./RiverDriftSpawner";
import { measureRiverRenderParity, type BuoyancyRenderParityResult } from "./RiverRenderParity";
import {
  BUOYANCY_PERFORMANCE_BODY_COUNTS,
  BUOYANCY_PROFILE_SAMPLE_CAPACITY,
  FlatWaterSurfaceProvider,
  STATIC_SINGLE_EXPECTED_BODY_HEIGHT,
  createBuoyancyProfilePontoons,
  getBuoyancyFixture,
  parseBuoyancyScenario,
  parseBuoyancySurfaceTime,
  summarizeProfile,
  type BuoyancyFixtureDefinition,
  type BuoyancyPerformanceCaseResult,
  type BuoyancyProfileSurfaceKind,
  type BuoyancyScenarioId
} from "./buoyancyFixture";
import { parseRiverDriftSeed } from "./riverDriftFixture";

const PROFILE_WARMUP_STEPS = 20;
const ALLOCATION_PROBE_WARMUP_STEPS = 120;
const STABILITY_DWELL_MS = 2000;
const STABILITY_SAMPLE_INTERVAL_MS = 50;
const STATIC_SETTLE_TIMEOUT_MS = 20000;
const STATIC_HEIGHT_TOLERANCE = 0.08;
const STATIC_MAX_LINEAR_SPEED = 0.08;
const RECOVERY_MAX_LINEAR_SPEED = 0.4;
const RECOVERY_MAX_ATTITUDE_DEGREES = 10;
const STATIC_WATER_CENTER_X = -7;
const CATCH_PLANE_Y = -8;
const FRAME_RATE_TARGETS = [30, 60, 120] as const;
const RIVER_PERTURBATION_TORQUE_PER_MASS = 150;
const RIVER_DRIFT_GATE_TIMEOUT_MS = 45000;
const RIVER_DRIFT_MIN_DOWNSTREAM_DISTANCE = 4;
const CURRENT_CONTROL_WATER_SPEED = 1.5;
const CURRENT_CONTROL_OBSERVATION_MS = 1800;
// Keep the profiling hot path aligned with RiverDriftSpawner's production demo tuning.
const PROFILE_HORIZONTAL_LINEAR_DRAG = 0;
const PROFILE_WATER_DENSITY = 1000;
const PROFILE_HORIZONTAL_DRAG_COEFFICIENT = 0.5;
const PROFILE_HORIZONTAL_DRAG_AREA_SCALE = 1;
const PROFILE_MAX_HORIZONTAL_DRAG_SPEED = 5;
const PROFILE_MAX_HORIZONTAL_FORCE_MULTIPLIER = 2;
const RIVER_DRIFT_AUTOMATIC_DESTROY_REASONS: readonly RiverDriftDestroyReason[] = [
  "capacity",
  "downstream",
  "expired",
  "off-water"
];

export interface BuoyancyStabilityResult {
  readonly scenario: BuoyancyScenarioId;
  readonly dwellMs: number;
  readonly sampleCount: number;
  readonly expectedBodyHeight: number | null;
  readonly minBodyHeight: number;
  readonly maxBodyHeight: number;
  readonly maxLinearSpeed: number;
  readonly maxAbsRollDegrees: number;
  readonly maxAbsPitchDegrees: number;
  readonly minSubmergedPontoonCount: number;
  readonly minQueryCountPerStep: number;
  readonly minAppliedForceCountPerStep: number;
  readonly fixedTimeStep: number;
  readonly runtimeError: string;
}

export interface BuoyancyFrameRateResult extends BuoyancyStabilityResult {
  readonly targetFrameRate: number;
  readonly renderFrameCount: number;
  readonly renderElapsedMs: number;
  readonly actualRenderFps: number;
  readonly bodyHeight: number;
  readonly rollDegrees: number;
  readonly pitchDegrees: number;
  readonly linearSpeed: number;
}

export interface BuoyancyAllocationProbeSnapshot {
  readonly ready: boolean;
  readonly surfaceKind: BuoyancyProfileSurfaceKind;
  readonly bodyCount: number;
  readonly pontoonCount: number;
  readonly horizontalDragEnabled: boolean;
  readonly queriesPerStep: number;
  readonly appliedForcesPerStep: number;
  readonly expectedQueriesPerStep: number;
  readonly preflightPontoonCount: number;
  readonly preflightAllInsideFootprint: boolean;
  readonly preflightAllExpectedSource: boolean;
  readonly warmupSteps: number;
  readonly fixedTimeStep: number;
}

export interface BuoyancySleepWakeResult {
  readonly surfaceKind: "reach";
  readonly sourceIndex: number;
  readonly worldPosition: BuoyancyVectorSnapshot;
  readonly lowSurfaceTime: number;
  readonly highSurfaceTime: number;
  readonly lowSurfaceHeight: number;
  readonly highSurfaceHeight: number;
  readonly surfaceHeightDelta: number;
  readonly pontoonRadius: number;
  readonly pontoonCenterHeight: number;
  readonly lowDryQueryCount: number;
  readonly lowDryAppliedForceCount: number;
  readonly lowDrySubmergedPontoonCount: number;
  readonly drySleepFixedSteps: number;
  readonly sleptImmediately: boolean;
  readonly remainedSleepingWhileDry: boolean;
  readonly wokeFromPointForce: boolean;
  readonly appliedForceCount: number;
  readonly highWetSubmergedPontoonCount: number;
}

export interface BuoyancyOffshoreCheckResult {
  readonly providerRejected: boolean;
  readonly queriesPerStep: number;
  readonly appliedForcesPerStep: number;
  readonly submergedPontoonCount: number;
}

export interface BuoyancyKinematicCheckResult {
  readonly isKinematic: boolean;
  readonly queriesPerStep: number;
  readonly appliedForcesPerStep: number;
  readonly submergedPontoonCount: number;
  readonly diagnostic: string;
}

export interface BuoyancyVectorSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BuoyancyParentTransformCheckResult {
  readonly dynamicCollider: boolean;
  readonly expectedWorldPosition: BuoyancyVectorSnapshot;
  readonly actualWorldPosition: BuoyancyVectorSnapshot;
  readonly worldPositionError: number;
  readonly expectedWorldRadius: number;
  readonly actualWorldRadius: number;
  readonly worldRadiusError: number;
  readonly queriesPerStep: number;
  readonly appliedForcesPerStep: number;
  readonly diagnostic: string;
}

export interface BuoyancyRecoveryGateResult extends BuoyancyStabilityResult {
  readonly disturbedRollDegrees: number;
  readonly disturbedPitchDegrees: number;
  readonly disturbedAttitudeDegrees: number;
  readonly disturbedSampledPontoonCount: number;
  readonly disturbedSubmergedPontoonCount: number;
  readonly disturbedAppliedForceCount: number;
  readonly disturbedMinPontoonForce: number;
  readonly disturbedMaxPontoonForce: number;
  readonly disturbedPontoonForceSpread: number;
  readonly disturbedMinSubmergedRatio: number;
  readonly disturbedMaxSubmergedRatio: number;
  readonly disturbedSubmergedRatioSpread: number;
}

export interface BuoyancyCurrentForceCheckResult {
  readonly waterSpeed: number;
  readonly initialRelativeSpeed: number;
  readonly finalRelativeSpeed: number;
  readonly initialPositionX: number;
  readonly finalPositionX: number;
  readonly downstreamDistance: number;
  readonly maxDownstreamSpeed: number;
  readonly firstHorizontalForceX: number;
  readonly appliedForceCount: number;
  readonly fixedTimeStep: number;
  readonly finite: boolean;
}

export interface BuoyancyRiverDriftGateResult {
  readonly seed: number;
  readonly observedSpawnCount: number;
  readonly spawnedTotal: number;
  readonly destroyedTotal: number;
  readonly capacityDestroyedCount: number;
  readonly automaticLifecycleDestroyedCount: number;
  readonly destroyReasons: readonly RiverDriftDestroyReason[];
  readonly maxObservedActiveCount: number;
  readonly scheduledTimes: readonly number[];
  readonly actualTimes: readonly number[];
  readonly actualIntervals: readonly number[];
  readonly heightOffsets: readonly number[];
  readonly distinctHeightCount: number;
  readonly freeFallCount: number;
  readonly enteredWaterCount: number;
  readonly alignedMovingCount: number;
  readonly maxVelocityWaterDot: number;
  readonly maxDownstreamDistance: number;
  readonly activeCountBeforeCleanup: number;
  readonly activeCountAfterCleanup: number;
  readonly finite: boolean;
  readonly runtimeError: string;
  readonly snapshots: readonly RiverDriftInstanceSnapshot[];
}

export type { BuoyancyRenderParityResult } from "./RiverRenderParity";

export interface WaterBuoyancyDemoMetrics {
  readonly ready: boolean;
  readonly scenario: BuoyancyScenarioId;
  readonly runtimeError: string;
  readonly bodyCount: number;
  readonly pontoonCount: number;
  readonly submergedPontoonCount: number;
  readonly bodyHeight: number;
  readonly rollDegrees: number;
  readonly pitchDegrees: number;
  readonly linearSpeed: number;
  readonly queryCountPerStep: number;
  readonly appliedForceCountPerStep: number;
  readonly surfaceParityError: number;
  readonly surfaceTime: number | null;
  readonly fixedTimeStep: number;
  readonly finite: boolean;
  readonly settled: boolean;
  readonly recovered: boolean;
  readonly lastDiagnostic: string;
  readonly driftEnabled: boolean;
  readonly driftSeed: number;
  readonly driftSpawnedTotal: number;
  readonly driftActiveCount: number;
  readonly driftInWaterCount: number;
  readonly driftEnteredWaterTotal: number;
  readonly driftCompletedDownstream: number;
  readonly driftDestroyedTotal: number;
  readonly driftRejectedCount: number;
  readonly driftLastSpawnHeight: number;
  readonly driftMaxDownstreamDistance: number;
  readonly driftFinite: boolean;
  readonly driftRuntimeError: string;
  readonly driftSnapshots: readonly RiverDriftInstanceSnapshot[];
  readonly performanceResults: readonly BuoyancyPerformanceCaseResult[];
  readonly frameRateResults: readonly BuoyancyFrameRateResult[];
}

export interface WaterBuoyancyDemoApi {
  readonly metrics: WaterBuoyancyDemoMetrics;
  selectScenario(scenario: BuoyancyScenarioId): void;
  reset(): void;
  perturb(): void;
  runSleepWakeCheck(): Promise<BuoyancySleepWakeResult>;
  runOffshoreCheck(): Promise<BuoyancyOffshoreCheckResult>;
  runKinematicCheck(): Promise<BuoyancyKinematicCheckResult>;
  runParentTransformCheck(): Promise<BuoyancyParentTransformCheckResult>;
  runRenderParityCheck(): BuoyancyRenderParityResult;
  runSinglePontoonGate(): Promise<BuoyancyStabilityResult>;
  runRecoveryGate(): Promise<BuoyancyRecoveryGateResult>;
  runCurrentForceCheck(): Promise<BuoyancyCurrentForceCheckResult>;
  runRiverDriftGate(): Promise<BuoyancyRiverDriftGateResult>;
  runPerformanceMatrix(): Promise<readonly BuoyancyPerformanceCaseResult[]>;
  runFrameRateConsistency(): Promise<readonly BuoyancyFrameRateResult[]>;
  prepareAllocationProbe(): Promise<BuoyancyAllocationProbeSnapshot>;
  getAllocationProbeSnapshot(): BuoyancyAllocationProbeSnapshot | null;
  disposeAllocationProbe(): void;
}

declare global {
  interface Window {
    waterBuoyancyDemo?: WaterBuoyancyDemoApi;
  }
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

interface ActiveBuoyancyBody {
  readonly fixture: BuoyancyFixtureDefinition;
  readonly entity: Entity;
  readonly collider: DynamicCollider;
  readonly buoyancy: WaterBuoyancy;
  readonly debugView: BuoyancyDebugView;
  readonly mesh: ModelMesh;
  readonly createdAtMs: number;
}

interface ProfilePlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ProfilePreflight {
  readonly pontoonCount: number;
  readonly allInsideFootprint: boolean;
  readonly allExpectedSource: boolean;
}

interface CreatedProfileCase {
  readonly root: Entity;
  readonly components: readonly WaterBuoyancy[];
  readonly preflight: ProfilePreflight;
  readonly horizontalDragEnabled: boolean;
}

interface AllocationProbeState extends CreatedProfileCase {
  readonly stepCounter: PhysicsStepCounter;
}

class DemoUpdateScript extends Script {
  callback: (() => void) | null = null;
  renderFrameCount = 0;

  onUpdate(): void {
    this.renderFrameCount++;
    this.callback?.();
  }
}

class BuoyancyProfileCollector extends Script {
  components: readonly WaterBuoyancy[] = [];
  readonly querySamples = new Float64Array(BUOYANCY_PROFILE_SAMPLE_CAPACITY);
  readonly solverSamples = new Float64Array(BUOYANCY_PROFILE_SAMPLE_CAPACITY);
  readonly applyForceSamples = new Float64Array(BUOYANCY_PROFILE_SAMPLE_CAPACITY);
  readonly totalSamples = new Float64Array(BUOYANCY_PROFILE_SAMPLE_CAPACITY);
  readonly queryCountSamples = new Uint32Array(BUOYANCY_PROFILE_SAMPLE_CAPACITY);
  readonly appliedForceCountSamples = new Uint32Array(BUOYANCY_PROFILE_SAMPLE_CAPACITY);
  private _stepCount = 0;
  private _sampleCount = 0;

  get sampleCount(): number {
    return this._sampleCount;
  }

  onPhysicsUpdate(): void {
    if (++this._stepCount <= PROFILE_WARMUP_STEPS) return;
    if (this._sampleCount >= BUOYANCY_PROFILE_SAMPLE_CAPACITY) return;
    let queryMs = 0;
    let solverMs = 0;
    let applyForceMs = 0;
    let totalMs = 0;
    let queryCount = 0;
    let appliedForceCount = 0;
    for (const component of this.components) {
      const metrics = component.profilingMetrics;
      queryMs += metrics.queryMs;
      solverMs += metrics.solverMs;
      applyForceMs += metrics.applyForceMs;
      totalMs += metrics.totalMs;
      queryCount += component.lastStepQueryCount;
      appliedForceCount += component.lastStepAppliedForceCount;
    }
    const sampleIndex = this._sampleCount++;
    this.querySamples[sampleIndex] = queryMs;
    this.solverSamples[sampleIndex] = solverMs;
    this.applyForceSamples[sampleIndex] = applyForceMs;
    this.totalSamples[sampleIndex] = totalMs;
    this.queryCountSamples[sampleIndex] = queryCount;
    this.appliedForceCountSamples[sampleIndex] = appliedForceCount;
  }
}

class PhysicsStepCounter extends Script {
  stepCount = 0;

  onPhysicsUpdate(): void {
    this.stepCount++;
  }
}

class FlowingFlatWaterSurfaceProvider extends FlatWaterSurfaceProvider {
  private readonly _waterVelocity = new Vector3(CURRENT_CONTROL_WATER_SPEED, 0, 0);

  override sampleSurface(worldPosition: Vector3, outSample: ReturnType<typeof createWaterSurfaceSample>): boolean {
    if (!super.sampleSurface(worldPosition, outSample)) return false;
    outSample.waterVelocity.copyFrom(this._waterVelocity);
    return true;
  }
}

const statusCandidate = document.getElementById("buoyancy-status");
const metricsCandidate = document.getElementById("buoyancy-metrics");
const resetCandidate = document.getElementById("buoyancy-reset");
const perturbCandidate = document.getElementById("buoyancy-perturb");
const profileCandidate = document.getElementById("buoyancy-profile");

if (
  !(statusCandidate instanceof HTMLSpanElement) ||
  !(metricsCandidate instanceof HTMLDListElement) ||
  !(resetCandidate instanceof HTMLButtonElement) ||
  !(perturbCandidate instanceof HTMLButtonElement) ||
  !(profileCandidate instanceof HTMLButtonElement)
) {
  throw new Error("Buoyancy HUD is missing required elements.");
}

const statusElement: HTMLSpanElement = statusCandidate;
const metricsElement: HTMLDListElement = metricsCandidate;
const resetButton: HTMLButtonElement = resetCandidate;
const perturbButton: HTMLButtonElement = perturbCandidate;
const profileButton: HTMLButtonElement = profileCandidate;
const scenarioButtons = document.querySelectorAll<HTMLButtonElement>("[data-scenario]");

const demoMetrics: Mutable<WaterBuoyancyDemoMetrics> = {
  ready: false,
  scenario: parseBuoyancyScenario(new URLSearchParams(window.location.search).get("scenario")),
  runtimeError: "",
  bodyCount: 0,
  pontoonCount: 0,
  submergedPontoonCount: 0,
  bodyHeight: 0,
  rollDegrees: 0,
  pitchDegrees: 0,
  linearSpeed: 0,
  queryCountPerStep: 0,
  appliedForceCountPerStep: 0,
  surfaceParityError: 0,
  surfaceTime: null,
  fixedTimeStep: 0,
  finite: true,
  settled: false,
  recovered: false,
  lastDiagnostic: "",
  driftEnabled: false,
  driftSeed: 0,
  driftSpawnedTotal: 0,
  driftActiveCount: 0,
  driftInWaterCount: 0,
  driftEnteredWaterTotal: 0,
  driftCompletedDownstream: 0,
  driftDestroyedTotal: 0,
  driftRejectedCount: 0,
  driftLastSpawnHeight: 0,
  driftMaxDownstreamDistance: 0,
  driftFinite: true,
  driftRuntimeError: "",
  driftSnapshots: [],
  performanceResults: [],
  frameRateResults: []
};

function freezeStageProfile(result: BuoyancyPerformanceCaseResult["query"]): BuoyancyPerformanceCaseResult["query"] {
  return Object.freeze({ ...result });
}

function freezePerformanceResult(result: BuoyancyPerformanceCaseResult): BuoyancyPerformanceCaseResult {
  return Object.freeze({
    ...result,
    query: freezeStageProfile(result.query),
    solver: freezeStageProfile(result.solver),
    applyForce: freezeStageProfile(result.applyForce),
    total: freezeStageProfile(result.total)
  });
}

function freezeStabilityResult<T extends BuoyancyStabilityResult>(result: T): Readonly<T> {
  return Object.freeze({ ...result });
}

function createMetricsSnapshot(): WaterBuoyancyDemoMetrics {
  return Object.freeze({
    ...demoMetrics,
    driftSnapshots: Object.freeze(demoMetrics.driftSnapshots.map(cloneDriftSnapshot)),
    performanceResults: Object.freeze([...demoMetrics.performanceResults]),
    frameRateResults: Object.freeze([...demoMetrics.frameRateResults])
  });
}

function cloneDriftVector(value: RiverDriftVectorSnapshot): RiverDriftVectorSnapshot {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function cloneDriftSnapshot(value: RiverDriftInstanceSnapshot): RiverDriftInstanceSnapshot {
  return Object.freeze({
    ...value,
    spawnPosition: cloneDriftVector(value.spawnPosition),
    position: cloneDriftVector(value.position),
    velocity: cloneDriftVector(value.velocity),
    waterVelocity: cloneDriftVector(value.waterVelocity)
  });
}

function setStatus(message: string, state: "loading" | "ready" | "error"): void {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function writeMetric(name: string, value: string): void {
  const target = metricsElement.querySelector(`[data-metric="${name}"]`);
  if (target) target.textContent = value;
}

function waitMilliseconds(durationMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs));
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(`Timed out after ${timeoutMs}ms.`);
    await waitMilliseconds(16);
  }
}

function normalizeAngle(degrees: number): number {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function snapshotVector(value: Vector3): BuoyancyVectorSnapshot {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function createBodyMaterial(engine: Engine): BlinnPhongMaterial {
  const material = new BlinnPhongMaterial(engine);
  material.baseColor = new Color(0.82, 0.48, 0.17, 1);
  material.specularColor = new Color(0.92, 0.84, 0.65, 1);
  material.emissiveColor = new Color(0.045, 0.021, 0.008, 1);
  material.shininess = 32;
  material.isGCIgnored = true;
  return material;
}

function useSharedPhysicsMaterial<T extends BoxColliderShape | PlaneColliderShape>(
  shape: T,
  material: PhysicsMaterial
): T {
  const defaultMaterial = shape.material;
  shape.material = material;
  defaultMaterial.destroy();
  return shape;
}

function createCatchPlane(root: Entity, physicsMaterial: PhysicsMaterial): void {
  const entity = root.createChild("buoyancy-catch-plane");
  entity.transform.setPosition(0, CATCH_PLANE_Y, 0);
  const collider = entity.addComponent(StaticCollider);
  collider.addShape(useSharedPhysicsMaterial(new PlaneColliderShape(), physicsMaterial));
}

function createStaticWaterVisual(engine: Engine, root: Entity): void {
  const surface = root.createChild("static-water-surface");
  surface.transform.setPosition(STATIC_WATER_CENTER_X, 0, 0);
  const renderer = surface.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 11, 11, 12, 12);
  renderer.setMaterial(createWaterPreviewMaterial(engine, "#1a8190", 0.64));

  const basin = root.createChild("static-water-basin");
  basin.transform.setPosition(STATIC_WATER_CENTER_X, -2.9, 0);
  const basinRenderer = basin.addComponent(MeshRenderer);
  basinRenderer.mesh = PrimitiveMesh.createCuboid(engine, 12, 0.25, 12);
  const basinMaterial = new BlinnPhongMaterial(engine);
  basinMaterial.baseColor = new Color(0.075, 0.12, 0.13, 1);
  basinRenderer.setMaterial(basinMaterial);
}

async function bootstrapBuoyancyDemo(): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  const engineConfiguration = {
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    physics: new PhysXPhysics(),
    graphicDeviceOptions: {
      webGLMode: search.get("webgl") === "1" ? WebGLMode.WebGL1 : WebGLMode.Auto
    }
  } as unknown as Parameters<typeof WebGLEngine.create>[0];
  const engine = await WebGLEngine.create(engineConfiguration);
  engine.canvas.resizeByClientSize();
  const resizeCanvas = (): void => engine.canvas.resizeByClientSize();
  window.addEventListener("resize", resizeCanvas);

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.018, 0.055, 0.068, 1);
  scene.ambientLight.diffuseSolidColor.set(0.42, 0.5, 0.52, 1);
  scene.ambientLight.diffuseIntensity = 0.72;
  const sharedPhysicsMaterial = new PhysicsMaterial();
  sharedPhysicsMaterial.staticFriction = 0.18;
  sharedPhysicsMaterial.dynamicFriction = 0.12;
  sharedPhysicsMaterial.bounciness = 0;
  const root = scene.createRootEntity("water-buoyancy-demo");
  createCatchPlane(root, sharedPhysicsMaterial);

  const lightEntity = root.createChild("sun");
  lightEntity.transform.setRotation(-48, -32, 0);
  const light = lightEntity.addComponent(DirectLight);
  light.color = new Color(1, 0.91, 0.73, 1);

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 320;
  camera.fieldOfView = 43;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.minDistance = 7;
  orbit.maxDistance = 180;

  const staticSceneRoot = root.createChild("static-buoyancy-scenario");
  createStaticWaterVisual(engine, staticSceneRoot);
  const staticProvider = new FlatWaterSurfaceProvider();

  const compileWorker = new RiverCompileWorkerClient();
  const riverResource = await compileWorker.compile(curvedMainRiverExample.riverDescriptor);
  const riverSceneRoot = root.createChild("river-buoyancy-scenario");
  const riverRuntimeRoot = riverSceneRoot.createChild("river-runtime");
  const riverRuntime = new RiverRuntimeController(engine, riverRuntimeRoot);
  riverRuntime.setSurfaceFeatureFlags(true, true);
  const surfaceTimeOverride = parseBuoyancySurfaceTime(search.get("surfaceTime"));
  riverRuntime.setSurfaceTimeOverride(surfaceTimeOverride);
  demoMetrics.surfaceTime = surfaceTimeOverride ?? null;
  riverRuntime.activate(riverResource.data.sourceId, riverResource);
  const riverProvider = new RiverWaterSurfaceProvider(riverRuntime);
  const riverBed = new RiverBedController(engine, riverSceneRoot);
  riverBed.rebuild(riverResource.data, WaterDecorationStyle.River);
  const riverDriftSeed = parseRiverDriftSeed(search.get("driftSeed"));
  const riverDriftAutoEnabled = search.get("drift") !== "0";
  const riverDriftRoot = riverSceneRoot.createChild("river-drift-stream");
  const riverDriftSpawner = riverDriftRoot.addComponent(RiverDriftSpawner);
  riverDriftSpawner.configure({
    compiledData: riverResource.data,
    surfaceProvider: riverProvider,
    seed: riverDriftSeed,
    catchPlaneY: CATCH_PLANE_Y,
    startPaused: true
  });

  const profileRiverResource = await compileWorker.compile(multiTributaryRiverExample.riverDescriptor);
  const profileRiverRuntimeRoot = root.createChild("buoyancy-profile-river-runtime");
  const profileRiverRuntime = new RiverRuntimeController(engine, profileRiverRuntimeRoot);
  profileRiverRuntime.setSurfaceFeatureFlags(true, true);
  profileRiverRuntime.setSurfaceTimeOverride(surfaceTimeOverride);
  profileRiverRuntime.activate(profileRiverResource.data.sourceId, profileRiverResource);
  const profileRiverProvider = new RiverWaterSurfaceProvider(profileRiverRuntime);
  profileRiverRuntimeRoot.isActive = false;

  const bodyRoot = root.createChild("buoyancy-bodies");
  const profileRoot = root.createChild("buoyancy-profile-cases");
  const bodyMaterial = createBodyMaterial(engine);
  const spawnSample = createWaterSurfaceSample();
  const offshoreReach = riverResource.data.reaches[0];
  const offshoreSource = offshoreReach.artifact.samples[Math.floor(offshoreReach.artifact.samples.length * 0.42)];
  const tangentLength = Math.hypot(offshoreSource.tangent[0], offshoreSource.tangent[2]);
  const lateralX = tangentLength > 0 ? -offshoreSource.tangent[2] / tangentLength : 1;
  const lateralZ = tangentLength > 0 ? offshoreSource.tangent[0] / tangentLength : 0;
  const offshoreDistance = offshoreSource.width * 1.5 + 2;
  const offshorePosition = new Vector3(
    offshoreSource.position[0] + lateralX * offshoreDistance,
    offshoreSource.position[1],
    offshoreSource.position[2] + lateralZ * offshoreDistance
  );
  const offshoreSurfaceSample = createWaterSurfaceSample();
  const torque = new Vector3();
  const frozenConstraints =
    DynamicColliderConstraints.FreezePositionX |
    DynamicColliderConstraints.FreezePositionY |
    DynamicColliderConstraints.FreezePositionZ |
    DynamicColliderConstraints.FreezeRotationX |
    DynamicColliderConstraints.FreezeRotationY |
    DynamicColliderConstraints.FreezeRotationZ;
  let activeBody: ActiveBuoyancyBody | null = null;
  let allocationProbe: AllocationProbeState | null = null;
  let profileRun: Promise<readonly BuoyancyPerformanceCaseResult[]> | null = null;
  let frameRateRun: Promise<readonly BuoyancyFrameRateResult[]> | null = null;
  let hudElapsed = 0;
  const profileQueryPosition = new Vector3();
  const profileQueryResult = createRiverNetworkQueryResult();

  const validateProfilePlacement = (
    worldX: number,
    worldZ: number,
    surfaceKind: BuoyancyProfileSurfaceKind,
    pontoonCount: 4 | 8
  ): ProfilePlacement | null => {
    const expectedSourceKind = surfaceKind === "junction" ? RiverChunkSourceKind.Junction : RiverChunkSourceKind.Reach;
    const pontoons = createBuoyancyProfilePontoons(pontoonCount);
    let minimumSurfaceHeight = Number.POSITIVE_INFINITY;
    for (let index = 0; index < pontoons.length; index++) {
      const localPosition = pontoons[index].localPosition;
      profileQueryPosition.set(worldX + localPosition.x, 0, worldZ + localPosition.z);
      if (
        !profileRiverRuntime.sampleActiveSurface(profileQueryPosition, profileQueryResult) ||
        !profileQueryResult.insideFootprint ||
        profileQueryResult.sourceKind !== expectedSourceKind
      ) {
        return null;
      }
      minimumSurfaceHeight = Math.min(minimumSurfaceHeight, profileQueryResult.surfaceHeight);
    }
    return Number.isFinite(minimumSurfaceHeight) ? { x: worldX, y: minimumSurfaceHeight - 0.04, z: worldZ } : null;
  };

  const createProfilePlacements = (
    bodyCount: number,
    pontoonCount: 4 | 8,
    surfaceKind: BuoyancyProfileSurfaceKind
  ): readonly ProfilePlacement[] => {
    const candidates: ProfilePlacement[] = [];
    if (surfaceKind === "reach") {
      for (const reach of profileRiverResource.data.reaches) {
        for (const sample of reach.artifact.samples) {
          const placement = validateProfilePlacement(sample.position[0], sample.position[2], surfaceKind, pontoonCount);
          if (placement) candidates.push(placement);
        }
      }
    } else {
      for (const junction of profileRiverResource.data.junctions) {
        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minZ = Number.POSITIVE_INFINITY;
        let maxZ = Number.NEGATIVE_INFINITY;
        for (const boundaryPoint of junction.queryBoundary) {
          minX = Math.min(minX, boundaryPoint[0]);
          maxX = Math.max(maxX, boundaryPoint[0]);
          minZ = Math.min(minZ, boundaryPoint[2]);
          maxZ = Math.max(maxZ, boundaryPoint[2]);
        }
        for (let worldX = minX + 0.25; worldX <= maxX - 0.25; worldX += 0.5) {
          for (let worldZ = minZ + 0.25; worldZ <= maxZ - 0.25; worldZ += 0.5) {
            const placement = validateProfilePlacement(worldX, worldZ, surfaceKind, pontoonCount);
            if (placement) candidates.push(placement);
          }
        }
      }
    }
    if (candidates.length < bodyCount) {
      throw new Error(
        `Only ${candidates.length} ${surfaceKind} placements passed Pontoon preflight; ${bodyCount} are required.`
      );
    }
    const placements = new Array<ProfilePlacement>(bodyCount);
    for (let index = 0; index < bodyCount; index++) {
      placements[index] = candidates[Math.floor((index * candidates.length) / bodyCount)];
    }
    return placements;
  };

  const preflightProfilePlacements = (
    placements: readonly ProfilePlacement[],
    pontoonCount: 4 | 8,
    surfaceKind: BuoyancyProfileSurfaceKind
  ): ProfilePreflight => {
    const expectedSourceKind = surfaceKind === "junction" ? RiverChunkSourceKind.Junction : RiverChunkSourceKind.Reach;
    const pontoons = createBuoyancyProfilePontoons(pontoonCount);
    let checkedPontoonCount = 0;
    let allInsideFootprint = true;
    let allExpectedSource = true;
    for (const placement of placements) {
      for (const pontoon of pontoons) {
        profileQueryPosition.set(
          placement.x + pontoon.localPosition.x,
          placement.y + pontoon.localPosition.y,
          placement.z + pontoon.localPosition.z
        );
        const hit = profileRiverRuntime.sampleActiveSurface(profileQueryPosition, profileQueryResult);
        checkedPontoonCount++;
        allInsideFootprint &&= hit && profileQueryResult.insideFootprint;
        allExpectedSource &&= hit && profileQueryResult.sourceKind === expectedSourceKind;
      }
    }
    return {
      pontoonCount: checkedPontoonCount,
      allInsideFootprint,
      allExpectedSource
    };
  };

  const createProfileCase = (
    bodyCount: number,
    pontoonCount: 4 | 8,
    surfaceKind: BuoyancyProfileSurfaceKind,
    profilingEnabled: boolean,
    horizontalDragEnabled: boolean,
    name: string
  ): CreatedProfileCase => {
    const placements = createProfilePlacements(bodyCount, pontoonCount, surfaceKind);
    const preflight = preflightProfilePlacements(placements, pontoonCount, surfaceKind);
    if (!preflight.allInsideFootprint || !preflight.allExpectedSource) {
      throw new Error(`${surfaceKind} profile Pontoon preflight failed.`);
    }
    const caseRoot = profileRoot.createChild(name);
    const components = new Array<WaterBuoyancy>(bodyCount);
    for (let index = 0; index < bodyCount; index++) {
      const placement = placements[index];
      const entity = caseRoot.createChild(`${name}-body-${index}`);
      entity.transform.setPosition(placement.x, placement.y, placement.z);
      const collider = entity.addComponent(DynamicCollider);
      const shape = useSharedPhysicsMaterial(new BoxColliderShape(), sharedPhysicsMaterial);
      shape.size = new Vector3(0.2, 0.2, 0.2);
      collider.addShape(shape);
      collider.mass = 0.5;
      collider.constraints = frozenConstraints;
      const buoyancy = entity.addComponent(WaterBuoyancy);
      buoyancy.surfaceProvider = profileRiverProvider;
      buoyancy.pontoons = createBuoyancyProfilePontoons(pontoonCount);
      buoyancy.profilingEnabled = profilingEnabled;
      buoyancy.applyHorizontalDrag = horizontalDragEnabled;
      if (horizontalDragEnabled) {
        buoyancy.horizontalLinearDrag = PROFILE_HORIZONTAL_LINEAR_DRAG;
        buoyancy.waterDensity = PROFILE_WATER_DENSITY;
        buoyancy.horizontalDragCoefficient = PROFILE_HORIZONTAL_DRAG_COEFFICIENT;
        buoyancy.horizontalDragAreaScale = PROFILE_HORIZONTAL_DRAG_AREA_SCALE;
        buoyancy.maxHorizontalDragSpeed = PROFILE_MAX_HORIZONTAL_DRAG_SPEED;
        buoyancy.maxHorizontalForceMultiplier = PROFILE_MAX_HORIZONTAL_FORCE_MULTIPLIER;
      }
      components[index] = buoyancy;
    }
    return { root: caseRoot, components, preflight, horizontalDragEnabled };
  };

  const runRenderParityCheck = (): BuoyancyRenderParityResult => {
    const surfaceTime = surfaceTimeOverride ?? engine.time.elapsedTime;
    const result = measureRiverRenderParity(riverProvider, riverResource.data, surfaceTime);
    demoMetrics.surfaceParityError = result.maxHeightError;
    return result;
  };

  const destroyActiveBody = (): void => {
    if (!activeBody) return;
    activeBody.debugView.destroy();
    activeBody.entity.destroy();
    activeBody.mesh.destroy(true);
    activeBody = null;
  };

  const configureCamera = (scenario: BuoyancyScenarioId): void => {
    if (scenario === "static-single") {
      cameraEntity.transform.setPosition(-15, 8.5, 13);
      orbit.target.set(-7, 0.35, 0);
    } else {
      cameraEntity.transform.setPosition(-43, 21, 14);
      orbit.target.set(-24, 8, -7);
    }
  };

  const createActiveBody = (fixture: BuoyancyFixtureDefinition, provider: WaterSurfaceProvider): ActiveBuoyancyBody => {
    const entity = bodyRoot.createChild(`body-${fixture.id}`);
    const spawnPosition = new Vector3(...fixture.initialPosition);
    if (fixture.id === "river-four" && provider.sampleSurface(spawnPosition, spawnSample)) {
      spawnPosition.y = spawnSample.surfacePosition.y + 2.5;
    }
    entity.transform.setPosition(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    entity.transform.setRotation(...fixture.initialRotation);

    const mesh = PrimitiveMesh.createCuboid(engine, ...fixture.bodySize);
    mesh.isGCIgnored = true;
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(bodyMaterial);

    const collider = entity.addComponent(DynamicCollider);
    const shape = useSharedPhysicsMaterial(new BoxColliderShape(), sharedPhysicsMaterial);
    shape.size = new Vector3(...fixture.bodySize);
    collider.addShape(shape);
    collider.mass = fixture.bodyMass;
    collider.linearDamping = 0.025;
    collider.angularDamping = 0.12;

    const buoyancy = entity.addComponent(WaterBuoyancy);
    buoyancy.surfaceProvider = provider;
    buoyancy.pontoons = fixture.createPontoons();
    buoyancy.buoyancyCoefficient = fixture.buoyancyCoefficient;
    buoyancy.verticalDamping = fixture.verticalDamping;
    buoyancy.maxForceMultiplier = fixture.maxForceMultiplier;
    const debugView = new BuoyancyDebugView(engine, bodyRoot, buoyancy);
    return { fixture, entity, collider, buoyancy, debugView, mesh, createdAtMs: performance.now() };
  };

  const selectScenario = (scenario: BuoyancyScenarioId): void => {
    riverDriftSpawner.pause();
    riverDriftSpawner.reset(riverDriftSeed);
    destroyActiveBody();
    demoMetrics.scenario = scenario;
    demoMetrics.runtimeError = "";
    demoMetrics.ready = false;
    const isStatic = scenario === "static-single";
    perturbButton.disabled = true;
    staticSceneRoot.isActive = isStatic;
    riverSceneRoot.isActive = !isStatic;
    configureCamera(scenario);
    if (isStatic) {
      activeBody = createActiveBody(getBuoyancyFixture(scenario), staticProvider);
    } else {
      runRenderParityCheck();
      if (riverDriftAutoEnabled) riverDriftSpawner.start();
    }
    for (const button of scenarioButtons) button.dataset.active = String(button.dataset.scenario === scenario);
    demoMetrics.ready = true;
    setStatus("physics running", "ready");
  };

  const reset = (): void => selectScenario(demoMetrics.scenario);

  const runSleepWakeCheck = async (): Promise<BuoyancySleepWakeResult> => {
    if (allocationProbe || profileRun || frameRateRun) {
      throw new Error("Sleep/wake validation cannot overlap another validation run.");
    }

    const queryPosition = new Vector3();
    const queryResult = createRiverNetworkQueryResult();
    let bestCandidate:
      | {
          x: number;
          z: number;
          sourceIndex: number;
          lowSurfaceTime: number;
          highSurfaceTime: number;
          lowSurfaceHeight: number;
          highSurfaceHeight: number;
        }
      | undefined;
    let bestSurfaceHeightDelta = 0;
    let entity: Entity | undefined;
    try {
      for (const reach of profileRiverResource.data.reaches) {
        const samples = reach.artifact.samples;
        const stride = Math.max(1, Math.floor(samples.length / 12));
        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += stride) {
          const sample = samples[sampleIndex];
          queryPosition.set(sample.position[0], sample.position[1], sample.position[2]);
          let sourceIndex = -1;
          let lowSurfaceTime = 0;
          let highSurfaceTime = 0;
          let lowSurfaceHeight = Number.POSITIVE_INFINITY;
          let highSurfaceHeight = Number.NEGATIVE_INFINITY;
          let validCandidate = true;
          for (let surfaceTime = 0; surfaceTime <= 48; surfaceTime += 0.5) {
            profileRiverRuntime.setSurfaceTimeOverride(surfaceTime);
            if (
              !profileRiverRuntime.sampleActiveSurface(queryPosition, queryResult) ||
              !queryResult.insideFootprint ||
              queryResult.sourceKind !== RiverChunkSourceKind.Reach
            ) {
              validCandidate = false;
              break;
            }
            if (sourceIndex < 0) sourceIndex = queryResult.sourceIndex;
            else if (queryResult.sourceIndex !== sourceIndex) {
              validCandidate = false;
              break;
            }
            if (queryResult.surfaceHeight < lowSurfaceHeight) {
              lowSurfaceHeight = queryResult.surfaceHeight;
              lowSurfaceTime = surfaceTime;
            }
            if (queryResult.surfaceHeight > highSurfaceHeight) {
              highSurfaceHeight = queryResult.surfaceHeight;
              highSurfaceTime = surfaceTime;
            }
          }
          const surfaceHeightDelta = highSurfaceHeight - lowSurfaceHeight;
          if (validCandidate && sourceIndex >= 0 && surfaceHeightDelta > bestSurfaceHeightDelta) {
            bestSurfaceHeightDelta = surfaceHeightDelta;
            bestCandidate = {
              x: sample.position[0],
              z: sample.position[2],
              sourceIndex,
              lowSurfaceTime,
              highSurfaceTime,
              lowSurfaceHeight,
              highSurfaceHeight
            };
          }
        }
      }

      if (!bestCandidate || bestSurfaceHeightDelta < 0.01) {
        throw new Error(
          `No stable River reach point produced the required dynamic height range; max=${bestSurfaceHeightDelta}.`
        );
      }

      const pontoonRadius = Math.max(0.025, Math.min(0.08, bestSurfaceHeightDelta * 0.3));
      const dryMargin = Math.min(bestSurfaceHeightDelta * 0.25, 0.02);
      const pontoonCenterHeight = bestCandidate.lowSurfaceHeight + pontoonRadius + dryMargin;
      profileRiverRuntime.setSurfaceTimeOverride(bestCandidate.lowSurfaceTime);
      entity = profileRoot.createChild("dynamic-surface-reimmersion-check");
      entity.transform.setPosition(bestCandidate.x, pontoonCenterHeight, bestCandidate.z);
      const collider = entity.addComponent(DynamicCollider);
      const shape = useSharedPhysicsMaterial(new BoxColliderShape(), sharedPhysicsMaterial);
      const shapeExtent = Math.max(0.04, pontoonRadius * 1.5);
      shape.size = new Vector3(shapeExtent, shapeExtent, shapeExtent);
      collider.addShape(shape);
      collider.mass = 1;
      collider.constraints = frozenConstraints;
      const buoyancy = entity.addComponent(WaterBuoyancy);
      buoyancy.surfaceProvider = profileRiverProvider;
      buoyancy.pontoons = [{ localPosition: new Vector3(), radius: pontoonRadius, enabled: true }];
      const stepCounter = entity.addComponent(PhysicsStepCounter);

      await waitUntil(
        () =>
          buoyancy.lastStepQueryCount === 1 &&
          buoyancy.submergedPontoonCount === 0 &&
          buoyancy.lastStepAppliedForceCount === 0,
        2000
      );
      const lowDryQueryCount = buoyancy.lastStepQueryCount;
      const lowDryAppliedForceCount = buoyancy.lastStepAppliedForceCount;
      const lowDrySubmergedPontoonCount = buoyancy.submergedPontoonCount;
      collider.sleep();
      const sleptImmediately = collider.isSleeping();
      const drySleepStartStep = stepCounter.stepCount;
      await waitUntil(() => stepCounter.stepCount >= drySleepStartStep + 5, 2000);
      const drySleepFixedSteps = stepCounter.stepCount - drySleepStartStep;
      const remainedSleepingWhileDry = collider.isSleeping();

      profileRiverRuntime.setSurfaceTimeOverride(bestCandidate.highSurfaceTime);
      await waitUntil(
        () => buoyancy.submergedPontoonCount > 0 && buoyancy.lastStepAppliedForceCount > 0 && !collider.isSleeping(),
        2000
      );
      return Object.freeze({
        surfaceKind: "reach" as const,
        sourceIndex: bestCandidate.sourceIndex,
        worldPosition: snapshotVector(entity.transform.worldPosition),
        lowSurfaceTime: bestCandidate.lowSurfaceTime,
        highSurfaceTime: bestCandidate.highSurfaceTime,
        lowSurfaceHeight: bestCandidate.lowSurfaceHeight,
        highSurfaceHeight: bestCandidate.highSurfaceHeight,
        surfaceHeightDelta: bestSurfaceHeightDelta,
        pontoonRadius,
        pontoonCenterHeight,
        lowDryQueryCount,
        lowDryAppliedForceCount,
        lowDrySubmergedPontoonCount,
        drySleepFixedSteps,
        sleptImmediately,
        remainedSleepingWhileDry,
        wokeFromPointForce: !collider.isSleeping(),
        appliedForceCount: buoyancy.lastStepAppliedForceCount,
        highWetSubmergedPontoonCount: buoyancy.submergedPontoonCount
      });
    } finally {
      profileRiverRuntime.setSurfaceTimeOverride(surfaceTimeOverride);
      entity?.destroy();
      await waitMilliseconds(20);
    }
  };

  const runOffshoreCheck = async (): Promise<BuoyancyOffshoreCheckResult> => {
    const providerRejected = !riverProvider.sampleSurface(offshorePosition, offshoreSurfaceSample);
    const entity = profileRoot.createChild("offshore-pontoon-check");
    entity.transform.setPosition(offshorePosition.x, offshorePosition.y, offshorePosition.z);
    const collider = entity.addComponent(DynamicCollider);
    const shape = useSharedPhysicsMaterial(new BoxColliderShape(), sharedPhysicsMaterial);
    shape.size = new Vector3(0.3, 0.3, 0.3);
    collider.addShape(shape);
    collider.mass = 1;
    collider.constraints = frozenConstraints;
    const buoyancy = entity.addComponent(WaterBuoyancy);
    buoyancy.surfaceProvider = riverProvider;
    buoyancy.pontoons = [{ localPosition: new Vector3(), radius: 0.2, enabled: true }];
    await waitUntil(() => buoyancy.lastStepQueryCount === 1, 2000);
    const result: BuoyancyOffshoreCheckResult = {
      providerRejected,
      queriesPerStep: buoyancy.lastStepQueryCount,
      appliedForcesPerStep: buoyancy.lastStepAppliedForceCount,
      submergedPontoonCount: buoyancy.submergedPontoonCount
    };
    entity.destroy();
    await waitMilliseconds(20);
    return result;
  };

  const runKinematicCheck = async (): Promise<BuoyancyKinematicCheckResult> => {
    if (allocationProbe || profileRun || frameRateRun) {
      throw new Error("Kinematic validation cannot overlap another validation run.");
    }
    const entity = profileRoot.createChild("kinematic-buoyancy-check");
    try {
      entity.transform.setPosition(STATIC_WATER_CENTER_X, 0, 0);
      const collider = entity.addComponent(DynamicCollider);
      const shape = useSharedPhysicsMaterial(new BoxColliderShape(), sharedPhysicsMaterial);
      shape.size = new Vector3(0.4, 0.4, 0.4);
      collider.addShape(shape);
      collider.isKinematic = true;
      const buoyancy = entity.addComponent(WaterBuoyancy);
      buoyancy.surfaceProvider = staticProvider;
      buoyancy.pontoons = [{ localPosition: new Vector3(), radius: 0.35, enabled: true }];
      await waitUntil(() => buoyancy.lastDiagnostic === "kinematic", 2000);
      return Object.freeze({
        isKinematic: collider.isKinematic,
        queriesPerStep: buoyancy.lastStepQueryCount,
        appliedForcesPerStep: buoyancy.lastStepAppliedForceCount,
        submergedPontoonCount: buoyancy.submergedPontoonCount,
        diagnostic: buoyancy.lastDiagnostic ?? ""
      });
    } finally {
      entity.destroy();
      await waitMilliseconds(20);
    }
  };

  const runParentTransformCheck = async (): Promise<BuoyancyParentTransformCheckResult> => {
    if (allocationProbe || profileRun || frameRateRun) {
      throw new Error("Parent-transform validation cannot overlap another validation run.");
    }
    const parent = profileRoot.createChild("parent-transform-buoyancy-check");
    try {
      parent.transform.setPosition(STATIC_WATER_CENTER_X, 3, 0);
      parent.transform.setRotation(19, 37, -11);
      parent.transform.setScale(1.8, 0.75, 1.35);
      const entity = parent.createChild("dynamic-body");
      entity.transform.setPosition(0.4, 0.5, -0.35);
      entity.transform.setRotation(-13, 22, 7);
      entity.transform.setScale(0.8, 1.2, 0.65);
      const collider = entity.addComponent(DynamicCollider);
      const shape = useSharedPhysicsMaterial(new BoxColliderShape(), sharedPhysicsMaterial);
      shape.size = new Vector3(0.4, 0.4, 0.4);
      collider.addShape(shape);
      collider.mass = 1;
      collider.constraints = frozenConstraints;
      const localPosition = new Vector3(0.3, -0.2, 0.25);
      const localRadius = 0.35;
      const buoyancy = entity.addComponent(WaterBuoyancy);
      buoyancy.surfaceProvider = staticProvider;
      buoyancy.pontoons = [{ localPosition, radius: localRadius, enabled: true }];
      await waitUntil(() => buoyancy.lastStepQueryCount === 1 && buoyancy.pontoonStates[0].enabled, 2000);

      const expectedWorldPosition = new Vector3();
      Vector3.transformCoordinate(localPosition, entity.transform.worldMatrix, expectedWorldPosition);
      const worldScale = entity.transform.lossyWorldScale;
      const expectedWorldRadius =
        localRadius * Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
      const state = buoyancy.pontoonStates[0];
      const dx = state.worldPosition.x - expectedWorldPosition.x;
      const dy = state.worldPosition.y - expectedWorldPosition.y;
      const dz = state.worldPosition.z - expectedWorldPosition.z;
      return Object.freeze({
        dynamicCollider: !collider.isKinematic,
        expectedWorldPosition: snapshotVector(expectedWorldPosition),
        actualWorldPosition: snapshotVector(state.worldPosition),
        worldPositionError: Math.hypot(dx, dy, dz),
        expectedWorldRadius,
        actualWorldRadius: state.worldRadius,
        worldRadiusError: Math.abs(state.worldRadius - expectedWorldRadius),
        queriesPerStep: buoyancy.lastStepQueryCount,
        appliedForcesPerStep: buoyancy.lastStepAppliedForceCount,
        diagnostic: buoyancy.lastDiagnostic ?? ""
      });
    } finally {
      parent.destroy();
      await waitMilliseconds(20);
    }
  };

  const perturb = (): void => {
    if (!activeBody || activeBody.fixture.id !== "river-four") return;
    const strength = activeBody.fixture.bodyMass * RIVER_PERTURBATION_TORQUE_PER_MASS;
    torque.set(strength * 0.35, 0, strength);
    activeBody.collider.applyTorque(torque);
  };

  const measureStaticSurfaceParity = (): number => {
    if (!activeBody) return 0;
    let maxError = 0;
    for (const state of activeBody.buoyancy.pontoonStates) {
      if (!state.enabled || !state.surfaceHit) continue;
      maxError = Math.max(maxError, Math.abs(state.surfacePosition.y - staticProvider.surfaceHeight));
    }
    return maxError;
  };

  const syncRiverDriftMetrics = (): RiverDriftInstanceSnapshot | null => {
    const source = riverDriftSpawner.metrics;
    demoMetrics.driftEnabled = source.enabled;
    demoMetrics.driftSeed = source.seed;
    demoMetrics.driftSpawnedTotal = source.spawnedTotal;
    demoMetrics.driftActiveCount = source.activeCount;
    demoMetrics.driftInWaterCount = source.inWaterCount;
    demoMetrics.driftEnteredWaterTotal = source.enteredWaterTotal;
    demoMetrics.driftCompletedDownstream = source.completedDownstream;
    demoMetrics.driftDestroyedTotal = source.destroyedTotal;
    demoMetrics.driftRejectedCount = source.rejectedCount;
    demoMetrics.driftLastSpawnHeight = source.lastSpawnHeight;
    demoMetrics.driftMaxDownstreamDistance = source.maxDownstreamDistance;
    demoMetrics.driftFinite = source.finite;
    demoMetrics.driftRuntimeError = source.runtimeError;
    demoMetrics.driftSnapshots = riverDriftSpawner.snapshots;
    let latest: RiverDriftInstanceSnapshot | null = null;
    for (const snapshot of riverDriftSpawner.snapshots) {
      if (snapshot.valid && snapshot.active && (!latest || snapshot.spawnIndex > latest.spawnIndex)) latest = snapshot;
    }
    return latest;
  };

  const updateMetrics = (): void => {
    const latestDriftSnapshot = syncRiverDriftMetrics();
    if (allocationProbe) return;
    if (activeBody) {
      activeBody.debugView.update();
      const position = activeBody.entity.transform.worldPosition;
      const rotation = activeBody.entity.transform.worldRotation;
      const velocity = activeBody.collider.linearVelocity;
      const roll = normalizeAngle(rotation.z);
      const pitch = normalizeAngle(rotation.x);
      const linearSpeed = velocity.length();
      const ageSeconds = (performance.now() - activeBody.createdAtMs) / 1000;
      const finite =
        Number.isFinite(position.x) &&
        Number.isFinite(position.y) &&
        Number.isFinite(position.z) &&
        Number.isFinite(roll) &&
        Number.isFinite(pitch) &&
        Number.isFinite(linearSpeed);
      const fellThrough = position.y < CATCH_PLANE_Y + 0.5;
      demoMetrics.runtimeError = finite ? (fellThrough ? "body-fell-through-water" : "") : "non-finite-body-state";
      demoMetrics.bodyCount = 1;
      demoMetrics.pontoonCount = activeBody.buoyancy.pontoons.length;
      demoMetrics.submergedPontoonCount = activeBody.buoyancy.submergedPontoonCount;
      demoMetrics.bodyHeight = position.y;
      demoMetrics.rollDegrees = roll;
      demoMetrics.pitchDegrees = pitch;
      demoMetrics.linearSpeed = linearSpeed;
      demoMetrics.queryCountPerStep = activeBody.buoyancy.lastStepQueryCount;
      demoMetrics.appliedForceCountPerStep = activeBody.buoyancy.lastStepAppliedForceCount;
      if (demoMetrics.scenario === "static-single") demoMetrics.surfaceParityError = measureStaticSurfaceParity();
      demoMetrics.finite = finite;
      demoMetrics.settled =
        ageSeconds >= 4 &&
        activeBody.buoyancy.isInWater &&
        Math.abs(demoMetrics.bodyHeight - STATIC_SINGLE_EXPECTED_BODY_HEIGHT) <= STATIC_HEIGHT_TOLERANCE &&
        linearSpeed <= STATIC_MAX_LINEAR_SPEED;
      demoMetrics.recovered =
        ageSeconds >= 4 &&
        activeBody.buoyancy.isInWater &&
        Math.abs(roll) <= RECOVERY_MAX_ATTITUDE_DEGREES &&
        Math.abs(pitch) <= RECOVERY_MAX_ATTITUDE_DEGREES &&
        linearSpeed <= RECOVERY_MAX_LINEAR_SPEED;
      demoMetrics.lastDiagnostic = activeBody.buoyancy.lastDiagnostic ?? "";
    } else {
      const velocity = latestDriftSnapshot?.velocity;
      demoMetrics.runtimeError = demoMetrics.driftRuntimeError;
      demoMetrics.bodyCount = demoMetrics.driftActiveCount;
      demoMetrics.pontoonCount = demoMetrics.driftActiveCount * 4;
      demoMetrics.submergedPontoonCount = riverDriftSpawner.metrics.submergedPontoonCount;
      demoMetrics.bodyHeight = latestDriftSnapshot?.position.y ?? 0;
      demoMetrics.rollDegrees = 0;
      demoMetrics.pitchDegrees = 0;
      demoMetrics.linearSpeed = velocity ? Math.hypot(velocity.x, velocity.y, velocity.z) : 0;
      demoMetrics.queryCountPerStep = riverDriftSpawner.metrics.queryCountPerStep;
      demoMetrics.appliedForceCountPerStep = riverDriftSpawner.metrics.appliedForceCountPerStep;
      demoMetrics.finite = demoMetrics.driftFinite;
      demoMetrics.settled = false;
      demoMetrics.recovered = false;
      demoMetrics.lastDiagnostic = "";
    }
    demoMetrics.fixedTimeStep = scene.physics.fixedTimeStep;

    hudElapsed += engine.time.deltaTime;
    if (hudElapsed < 0.08) return;
    hudElapsed = 0;
    writeMetric("scenario", demoMetrics.scenario);
    writeMetric("bodies", String(demoMetrics.bodyCount));
    writeMetric("pontoons", String(demoMetrics.pontoonCount));
    writeMetric("submerged", String(demoMetrics.submergedPontoonCount));
    writeMetric("drift-count", `${demoMetrics.driftSpawnedTotal} / ${demoMetrics.driftActiveCount}`);
    writeMetric("drift-water", String(demoMetrics.driftInWaterCount));
    writeMetric("drift-distance", `${demoMetrics.driftMaxDownstreamDistance.toFixed(2)} m`);
    writeMetric(
      "drift-height",
      demoMetrics.driftSpawnedTotal > 0 ? `${demoMetrics.driftLastSpawnHeight.toFixed(2)} m` : "—"
    );
    writeMetric("height", demoMetrics.bodyHeight.toFixed(3));
    writeMetric("attitude", `${demoMetrics.rollDegrees.toFixed(1)}° / ${demoMetrics.pitchDegrees.toFixed(1)}°`);
    writeMetric("queries", String(demoMetrics.queryCountPerStep));
    writeMetric("surface-error", demoMetrics.surfaceParityError.toExponential(2));
    writeMetric("surface-time", demoMetrics.surfaceTime === null ? "live" : demoMetrics.surfaceTime.toFixed(3));
    writeMetric("error", demoMetrics.runtimeError || "none");
    if (demoMetrics.runtimeError) setStatus("physics validation failed", "error");
    else if (demoMetrics.scenario === "river-four" && demoMetrics.driftEnabled) {
      setStatus("3s upstream cube stream", "ready");
    } else if (demoMetrics.settled) setStatus("stable buoyancy", "ready");
  };

  const runDwellGate = async (
    scenario: BuoyancyScenarioId,
    expectedBodyHeight: number | null,
    isAcceptable: (body: ActiveBuoyancyBody) => boolean
  ): Promise<BuoyancyStabilityResult> => {
    const body = activeBody;
    if (!body) throw new Error(`${scenario} stability gate lost its active body.`);
    const fixedTimeStep = scene.physics.fixedTimeStep;
    const deadline = performance.now() + STATIC_SETTLE_TIMEOUT_MS;
    let dwellStart = 0;
    let sampleCount = 0;
    let minBodyHeight = Number.POSITIVE_INFINITY;
    let maxBodyHeight = Number.NEGATIVE_INFINITY;
    let maxLinearSpeed = 0;
    let maxAbsRollDegrees = 0;
    let maxAbsPitchDegrees = 0;
    let minSubmergedPontoonCount = Number.POSITIVE_INFINITY;
    let minQueryCountPerStep = Number.POSITIVE_INFINITY;
    let minAppliedForceCountPerStep = Number.POSITIVE_INFINITY;

    while (performance.now() < deadline) {
      await waitMilliseconds(STABILITY_SAMPLE_INTERVAL_MS);
      if (activeBody !== body || demoMetrics.scenario !== scenario) {
        throw new Error(`${scenario} stability gate lost its active body.`);
      }
      if (scene.physics.fixedTimeStep !== fixedTimeStep) {
        throw new Error(`${scenario} changed its fixed physics step during the stability dwell.`);
      }
      if (!isAcceptable(body)) {
        dwellStart = 0;
        sampleCount = 0;
        minBodyHeight = Number.POSITIVE_INFINITY;
        maxBodyHeight = Number.NEGATIVE_INFINITY;
        maxLinearSpeed = 0;
        maxAbsRollDegrees = 0;
        maxAbsPitchDegrees = 0;
        minSubmergedPontoonCount = Number.POSITIVE_INFINITY;
        minQueryCountPerStep = Number.POSITIVE_INFINITY;
        minAppliedForceCountPerStep = Number.POSITIVE_INFINITY;
        continue;
      }
      if (dwellStart === 0) dwellStart = performance.now();
      const bodyHeight = body.entity.transform.worldPosition.y;
      const rotation = body.entity.transform.worldRotation;
      const linearSpeed = body.collider.linearVelocity.length();
      sampleCount++;
      minBodyHeight = Math.min(minBodyHeight, bodyHeight);
      maxBodyHeight = Math.max(maxBodyHeight, bodyHeight);
      maxLinearSpeed = Math.max(maxLinearSpeed, linearSpeed);
      maxAbsRollDegrees = Math.max(maxAbsRollDegrees, Math.abs(normalizeAngle(rotation.z)));
      maxAbsPitchDegrees = Math.max(maxAbsPitchDegrees, Math.abs(normalizeAngle(rotation.x)));
      minSubmergedPontoonCount = Math.min(minSubmergedPontoonCount, body.buoyancy.submergedPontoonCount);
      minQueryCountPerStep = Math.min(minQueryCountPerStep, body.buoyancy.lastStepQueryCount);
      minAppliedForceCountPerStep = Math.min(minAppliedForceCountPerStep, body.buoyancy.lastStepAppliedForceCount);
      if (performance.now() - dwellStart < STABILITY_DWELL_MS) continue;

      return freezeStabilityResult({
        scenario,
        dwellMs: performance.now() - dwellStart,
        sampleCount,
        expectedBodyHeight,
        minBodyHeight,
        maxBodyHeight,
        maxLinearSpeed,
        maxAbsRollDegrees,
        maxAbsPitchDegrees,
        minSubmergedPontoonCount,
        minQueryCountPerStep,
        minAppliedForceCountPerStep,
        fixedTimeStep,
        runtimeError: demoMetrics.runtimeError
      });
    }

    throw new Error(`${scenario} did not remain acceptable for ${STABILITY_DWELL_MS}ms before timeout.`);
  };

  const isStaticBodyAcceptable = (body: ActiveBuoyancyBody): boolean => {
    const bodyHeight = body.entity.transform.worldPosition.y;
    return (
      body.fixture.id === "static-single" &&
      demoMetrics.runtimeError === "" &&
      bodyHeight > CATCH_PLANE_Y + 1 &&
      Math.abs(bodyHeight - STATIC_SINGLE_EXPECTED_BODY_HEIGHT) <= STATIC_HEIGHT_TOLERANCE &&
      body.collider.linearVelocity.length() <= STATIC_MAX_LINEAR_SPEED &&
      body.buoyancy.submergedPontoonCount === 1 &&
      body.buoyancy.lastStepQueryCount === 1 &&
      body.buoyancy.lastStepAppliedForceCount === 1 &&
      body.buoyancy.lastDiagnostic === null
    );
  };

  const isRecoveredBodyAcceptable = (body: ActiveBuoyancyBody): boolean => {
    const rotation = body.entity.transform.worldRotation;
    return (
      body.fixture.id === "river-four" &&
      demoMetrics.runtimeError === "" &&
      body.entity.transform.worldPosition.y > CATCH_PLANE_Y + 1 &&
      body.collider.linearVelocity.length() <= RECOVERY_MAX_LINEAR_SPEED &&
      Math.abs(normalizeAngle(rotation.z)) <= RECOVERY_MAX_ATTITUDE_DEGREES &&
      Math.abs(normalizeAngle(rotation.x)) <= RECOVERY_MAX_ATTITUDE_DEGREES &&
      body.buoyancy.submergedPontoonCount >= 1 &&
      body.buoyancy.lastStepQueryCount === 4 &&
      body.buoyancy.lastStepAppliedForceCount >= 1 &&
      body.buoyancy.lastDiagnostic === null
    );
  };

  const runSinglePontoonGate = async (): Promise<BuoyancyStabilityResult> => {
    selectScenario("static-single");
    return runDwellGate("static-single", STATIC_SINGLE_EXPECTED_BODY_HEIGHT, isStaticBodyAcceptable);
  };

  const runCurrentForceCheck = async (): Promise<BuoyancyCurrentForceCheckResult> => {
    if (allocationProbe || profileRun || frameRateRun) {
      throw new Error("Current-force validation cannot overlap another validation run.");
    }
    const restoreStream = riverDriftSpawner.metrics.enabled && demoMetrics.scenario === "river-four";
    riverDriftSpawner.pause();
    riverDriftSpawner.clear();
    const entity = profileRoot.createChild("flat-current-force-check");
    try {
      entity.transform.setPosition(-5, 0, 3);
      const collider = entity.addComponent(DynamicCollider);
      const shape = useSharedPhysicsMaterial(new BoxColliderShape(), sharedPhysicsMaterial);
      shape.size = new Vector3(0.6, 0.6, 0.6);
      collider.addShape(shape);
      collider.mass = 50;
      collider.linearDamping = 0.025;
      collider.constraints =
        DynamicColliderConstraints.FreezePositionY |
        DynamicColliderConstraints.FreezePositionZ |
        DynamicColliderConstraints.FreezeRotationX |
        DynamicColliderConstraints.FreezeRotationY |
        DynamicColliderConstraints.FreezeRotationZ;
      const buoyancy = entity.addComponent(WaterBuoyancy);
      buoyancy.surfaceProvider = new FlowingFlatWaterSurfaceProvider();
      buoyancy.pontoons = [{ localPosition: new Vector3(), radius: 0.35, enabled: true }];
      buoyancy.buoyancyCoefficient = 0;
      buoyancy.verticalDamping = 0;
      buoyancy.maxForceMultiplier = 0;
      buoyancy.applyHorizontalDrag = true;
      buoyancy.waterDensity = 1000;
      buoyancy.horizontalDragCoefficient = 0.5;
      buoyancy.maxHorizontalDragSpeed = 5;
      buoyancy.maxHorizontalForceMultiplier = 2;

      const initialPositionX = entity.transform.worldPosition.x;
      await waitUntil(
        () =>
          buoyancy.pontoonStates[0].horizontalForce.x > 0 &&
          buoyancy.lastStepAppliedForceCount === 1 &&
          collider.linearVelocity.x >= 0,
        3000
      );
      const firstHorizontalForceX = buoyancy.pontoonStates[0].horizontalForce.x;
      let maxDownstreamSpeed = collider.linearVelocity.x;
      const deadline = performance.now() + CURRENT_CONTROL_OBSERVATION_MS;
      while (performance.now() < deadline) {
        await waitMilliseconds(16);
        maxDownstreamSpeed = Math.max(maxDownstreamSpeed, collider.linearVelocity.x);
      }
      const finalPositionX = entity.transform.worldPosition.x;
      const finalSpeed = collider.linearVelocity.x;
      const finalRelativeSpeed = Math.abs(CURRENT_CONTROL_WATER_SPEED - finalSpeed);
      const finite =
        Number.isFinite(firstHorizontalForceX) &&
        Number.isFinite(finalPositionX) &&
        Number.isFinite(finalSpeed) &&
        Number.isFinite(maxDownstreamSpeed);
      return Object.freeze({
        waterSpeed: CURRENT_CONTROL_WATER_SPEED,
        initialRelativeSpeed: CURRENT_CONTROL_WATER_SPEED,
        finalRelativeSpeed,
        initialPositionX,
        finalPositionX,
        downstreamDistance: finalPositionX - initialPositionX,
        maxDownstreamSpeed,
        firstHorizontalForceX,
        appliedForceCount: buoyancy.lastStepAppliedForceCount,
        fixedTimeStep: scene.physics.fixedTimeStep,
        finite
      });
    } finally {
      entity.destroy();
      await waitMilliseconds(20);
      if (restoreStream) {
        riverDriftSpawner.reset(riverDriftSeed);
        riverDriftSpawner.start();
      }
    }
  };

  const runRecoveryGate = async (): Promise<BuoyancyRecoveryGateResult> => {
    const originalScenario = demoMetrics.scenario;
    selectScenario("river-four");
    riverDriftSpawner.pause();
    riverDriftSpawner.clear();
    activeBody = createActiveBody(getBuoyancyFixture("river-four"), riverProvider);
    try {
      await waitUntil(() => activeBody !== null && isRecoveredBodyAcceptable(activeBody), STATIC_SETTLE_TIMEOUT_MS);
      perturb();
      let disturbedRollDegrees = 0;
      let disturbedPitchDegrees = 0;
      let disturbedAttitudeDegrees = 0;
      let disturbedSampledPontoonCount = 0;
      let disturbedSubmergedPontoonCount = 0;
      let disturbedAppliedForceCount = 0;
      let disturbedMinPontoonForce = 0;
      let disturbedMaxPontoonForce = 0;
      let disturbedPontoonForceSpread = 0;
      let disturbedMinSubmergedRatio = 0;
      let disturbedMaxSubmergedRatio = 0;
      let disturbedSubmergedRatioSpread = 0;
      await waitUntil(() => {
        if (!activeBody) return false;
        const rotation = activeBody.entity.transform.worldRotation;
        const rollDegrees = normalizeAngle(rotation.z);
        const pitchDegrees = normalizeAngle(rotation.x);
        const attitudeDegrees = Math.max(Math.abs(rollDegrees), Math.abs(pitchDegrees));
        if (attitudeDegrees <= RECOVERY_MAX_ATTITUDE_DEGREES) return false;

        let sampledPontoonCount = 0;
        let minPontoonForce = Number.POSITIVE_INFINITY;
        let maxPontoonForce = Number.NEGATIVE_INFINITY;
        let minSubmergedRatio = Number.POSITIVE_INFINITY;
        let maxSubmergedRatio = Number.NEGATIVE_INFINITY;
        for (const state of activeBody.buoyancy.pontoonStates) {
          if (!state.enabled || !state.surfaceHit) continue;
          const forceMagnitude = state.force.length();
          sampledPontoonCount++;
          minPontoonForce = Math.min(minPontoonForce, forceMagnitude);
          maxPontoonForce = Math.max(maxPontoonForce, forceMagnitude);
          minSubmergedRatio = Math.min(minSubmergedRatio, state.submergedRatio);
          maxSubmergedRatio = Math.max(maxSubmergedRatio, state.submergedRatio);
        }
        const appliedForceCount = activeBody.buoyancy.lastStepAppliedForceCount;
        const forceSpread = maxPontoonForce - minPontoonForce;
        const submergedRatioSpread = maxSubmergedRatio - minSubmergedRatio;
        if (
          sampledPontoonCount < 2 ||
          appliedForceCount < 2 ||
          !Number.isFinite(forceSpread) ||
          forceSpread <= 1e-5 ||
          !Number.isFinite(submergedRatioSpread) ||
          submergedRatioSpread <= 1e-5
        ) {
          return false;
        }

        disturbedRollDegrees = rollDegrees;
        disturbedPitchDegrees = pitchDegrees;
        disturbedAttitudeDegrees = attitudeDegrees;
        disturbedSampledPontoonCount = sampledPontoonCount;
        disturbedSubmergedPontoonCount = activeBody.buoyancy.submergedPontoonCount;
        disturbedAppliedForceCount = appliedForceCount;
        disturbedMinPontoonForce = minPontoonForce;
        disturbedMaxPontoonForce = maxPontoonForce;
        disturbedPontoonForceSpread = forceSpread;
        disturbedMinSubmergedRatio = minSubmergedRatio;
        disturbedMaxSubmergedRatio = maxSubmergedRatio;
        disturbedSubmergedRatioSpread = submergedRatioSpread;
        return true;
      }, 4000);
      const stability = await runDwellGate("river-four", null, isRecoveredBodyAcceptable);
      return freezeStabilityResult({
        ...stability,
        disturbedRollDegrees,
        disturbedPitchDegrees,
        disturbedAttitudeDegrees,
        disturbedSampledPontoonCount,
        disturbedSubmergedPontoonCount,
        disturbedAppliedForceCount,
        disturbedMinPontoonForce,
        disturbedMaxPontoonForce,
        disturbedPontoonForceSpread,
        disturbedMinSubmergedRatio,
        disturbedMaxSubmergedRatio,
        disturbedSubmergedRatioSpread
      });
    } finally {
      destroyActiveBody();
      selectScenario(originalScenario);
    }
  };

  const runRiverDriftGate = async (): Promise<BuoyancyRiverDriftGateResult> => {
    if (allocationProbe || profileRun || frameRateRun) {
      throw new Error("River drift validation cannot overlap another validation run.");
    }
    const originalScenario = demoMetrics.scenario;
    selectScenario("river-four");
    riverDriftSpawner.pause();
    riverDriftSpawner.reset(riverDriftSeed);
    riverDriftSpawner.start();
    let maxObservedActiveCount = 0;
    try {
      await waitUntil(() => {
        const metrics = riverDriftSpawner.metrics;
        maxObservedActiveCount = Math.max(maxObservedActiveCount, metrics.activeCount);
        const snapshots = riverDriftSpawner.snapshots
          .filter((snapshot) => snapshot.valid)
          .sort((left, right) => left.spawnIndex - right.spawnIndex)
          .slice(0, 11);
        const firstThree = snapshots.slice(0, 3);
        if (
          metrics.spawnedTotal < 11 ||
          snapshots.length < 11 ||
          firstThree.length < 3 ||
          !firstThree.every((snapshot) => snapshot.hadFreeFall && snapshot.enteredWater)
        ) {
          return false;
        }
        const distinctHeightCount = new Set(firstThree.map((snapshot) => snapshot.heightOffset.toFixed(5))).size;
        let alignedMoving = false;
        for (const snapshot of snapshots) {
          const velocityWaterDot =
            snapshot.velocity.x * snapshot.waterVelocity.x + snapshot.velocity.z * snapshot.waterVelocity.z;
          alignedMoving ||= velocityWaterDot > 0.05 && snapshot.downstreamDistance > 0.25;
        }
        const capacityDestroyedCount = snapshots.filter((snapshot) => snapshot.destroyReason === "capacity").length;
        const automaticLifecycleDestroyedCount = snapshots.filter((snapshot) =>
          RIVER_DRIFT_AUTOMATIC_DESTROY_REASONS.includes(snapshot.destroyReason)
        ).length;
        return (
          distinctHeightCount >= 2 &&
          alignedMoving &&
          metrics.maxDownstreamDistance >= RIVER_DRIFT_MIN_DOWNSTREAM_DISTANCE &&
          metrics.activeCount <= 10 &&
          maxObservedActiveCount <= 10 &&
          automaticLifecycleDestroyedCount >= 1 &&
          (metrics.activeCount < 10 || capacityDestroyedCount >= 1) &&
          metrics.finite &&
          metrics.runtimeError === ""
        );
      }, RIVER_DRIFT_GATE_TIMEOUT_MS);

      riverDriftSpawner.pause();
      const snapshots = riverDriftSpawner.snapshots
        .filter((snapshot) => snapshot.valid)
        .sort((left, right) => left.spawnIndex - right.spawnIndex)
        .map(cloneDriftSnapshot);
      const firstThree = snapshots.slice(0, 3);
      const scheduledTimes = firstThree.map((snapshot) => snapshot.scheduledTime);
      const actualTimes = firstThree.map((snapshot) => snapshot.actualTime);
      const actualIntervals = actualTimes.slice(1).map((time, index) => time - actualTimes[index]);
      const heightOffsets = firstThree.map((snapshot) => snapshot.heightOffset);
      const distinctHeightCount = new Set(heightOffsets.map((height) => height.toFixed(5))).size;
      let alignedMovingCount = 0;
      let maxVelocityWaterDot = Number.NEGATIVE_INFINITY;
      for (const snapshot of snapshots) {
        const velocityWaterDot =
          snapshot.velocity.x * snapshot.waterVelocity.x + snapshot.velocity.z * snapshot.waterVelocity.z;
        maxVelocityWaterDot = Math.max(maxVelocityWaterDot, velocityWaterDot);
        if (snapshot.enteredWater && velocityWaterDot > 0.05 && snapshot.downstreamDistance > 0.25)
          alignedMovingCount++;
      }
      const metrics = riverDriftSpawner.metrics;
      maxObservedActiveCount = Math.max(maxObservedActiveCount, metrics.activeCount);
      const activeCountBeforeCleanup = metrics.activeCount;
      const spawnedTotal = metrics.spawnedTotal;
      const destroyedTotal = metrics.destroyedTotal;
      const capacityDestroyedCount = snapshots.filter((snapshot) => snapshot.destroyReason === "capacity").length;
      const destroyReasons = snapshots.map((snapshot) => snapshot.destroyReason).filter((reason) => reason !== "");
      const automaticLifecycleDestroyedCount = destroyReasons.filter((reason) =>
        RIVER_DRIFT_AUTOMATIC_DESTROY_REASONS.includes(reason)
      ).length;
      const maxDownstreamDistance = metrics.maxDownstreamDistance;
      const finite = metrics.finite && snapshots.every((snapshot) => snapshot.finite);
      const runtimeError = metrics.runtimeError;
      riverDriftSpawner.clear();
      const activeCountAfterCleanup = riverDriftSpawner.metrics.activeCount;
      return Object.freeze({
        seed: metrics.seed,
        observedSpawnCount: snapshots.length,
        spawnedTotal,
        destroyedTotal,
        capacityDestroyedCount,
        automaticLifecycleDestroyedCount,
        destroyReasons: Object.freeze(destroyReasons),
        maxObservedActiveCount,
        scheduledTimes: Object.freeze(scheduledTimes),
        actualTimes: Object.freeze(actualTimes),
        actualIntervals: Object.freeze(actualIntervals),
        heightOffsets: Object.freeze(heightOffsets),
        distinctHeightCount,
        freeFallCount: firstThree.filter((snapshot) => snapshot.hadFreeFall).length,
        enteredWaterCount: firstThree.filter((snapshot) => snapshot.enteredWater).length,
        alignedMovingCount,
        maxVelocityWaterDot: Number.isFinite(maxVelocityWaterDot) ? maxVelocityWaterDot : 0,
        maxDownstreamDistance,
        activeCountBeforeCleanup,
        activeCountAfterCleanup,
        finite,
        runtimeError,
        snapshots: Object.freeze(snapshots)
      });
    } finally {
      riverDriftSpawner.pause();
      riverDriftSpawner.clear();
      selectScenario(originalScenario);
    }
  };

  const runPerformanceCase = async (
    bodyCount: number,
    pontoonCount: 4 | 8,
    surfaceKind: BuoyancyProfileSurfaceKind,
    horizontalDragEnabled: boolean
  ): Promise<BuoyancyPerformanceCaseResult> => {
    const createdCase = createProfileCase(
      bodyCount,
      pontoonCount,
      surfaceKind,
      true,
      horizontalDragEnabled,
      `profile-${surfaceKind}-${bodyCount}x${pontoonCount}-horizontal-${horizontalDragEnabled ? "on" : "off"}`
    );
    try {
      const collector = createdCase.root.addComponent(BuoyancyProfileCollector);
      collector.components = createdCase.components;
      await waitUntil(() => collector.sampleCount >= BUOYANCY_PROFILE_SAMPLE_CAPACITY, 20000);
      const sampleCount = collector.sampleCount;
      const finalSampleIndex = sampleCount - 1;
      const fixedStepBudgetMs = scene.physics.fixedTimeStep * 1000;
      const total = summarizeProfile(collector.totalSamples, sampleCount);
      return freezePerformanceResult({
        surfaceKind,
        bodyCount,
        pontoonCount,
        horizontalDragEnabled,
        queriesPerStep: collector.queryCountSamples[finalSampleIndex],
        appliedForcesPerStep: collector.appliedForceCountSamples[finalSampleIndex],
        expectedQueriesPerStep: bodyCount * pontoonCount,
        preflightPontoonCount: createdCase.preflight.pontoonCount,
        preflightAllInsideFootprint: createdCase.preflight.allInsideFootprint,
        preflightAllExpectedSource: createdCase.preflight.allExpectedSource,
        fixedStepBudgetMs,
        mainThreadBudgetShareP95: fixedStepBudgetMs > 0 ? (total.p95Ms / fixedStepBudgetMs) * 100 : 0,
        query: summarizeProfile(collector.querySamples, sampleCount),
        solver: summarizeProfile(collector.solverSamples, sampleCount),
        applyForce: summarizeProfile(collector.applyForceSamples, sampleCount),
        total
      });
    } finally {
      createdCase.root.destroy();
      await waitMilliseconds(20);
    }
  };

  const runPerformanceMatrix = (): Promise<readonly BuoyancyPerformanceCaseResult[]> => {
    if (profileRun) return profileRun;
    const restoreStream = riverDriftSpawner.metrics.enabled && demoMetrics.scenario === "river-four";
    riverDriftSpawner.pause();
    riverDriftSpawner.clear();
    profileRun = (async () => {
      setStatus("profiling 1 / 20 / 100 bodies", "loading");
      profileButton.disabled = true;
      const results: BuoyancyPerformanceCaseResult[] = [];
      for (const bodyCount of BUOYANCY_PERFORMANCE_BODY_COUNTS) {
        results.push(await runPerformanceCase(bodyCount, 4, "reach", false));
      }
      results.push(await runPerformanceCase(100, 4, "reach", true));
      results.push(await runPerformanceCase(20, 8, "reach", false));
      results.push(await runPerformanceCase(100, 4, "junction", false));
      const frozenResults = Object.freeze(results);
      demoMetrics.performanceResults = frozenResults;
      const stress =
        frozenResults.find(
          (result) => result.surfaceKind === "junction" && result.bodyCount === 100 && result.pontoonCount === 4
        ) ?? frozenResults[0];
      writeMetric("query-p95", `${stress.query.p95Ms.toFixed(3)} ms`);
      writeMetric("solver-p95", `${stress.solver.p95Ms.toFixed(3)} ms`);
      writeMetric("force-p95", `${stress.applyForce.p95Ms.toFixed(3)} ms`);
      setStatus("performance matrix ready", "ready");
      return frozenResults;
    })().finally(() => {
      profileRun = null;
      profileButton.disabled = false;
      if (restoreStream) {
        riverDriftSpawner.reset(riverDriftSeed);
        riverDriftSpawner.start();
      }
    });
    return profileRun;
  };

  const runFrameRateConsistency = (): Promise<readonly BuoyancyFrameRateResult[]> => {
    if (frameRateRun) return frameRateRun;
    frameRateRun = (async () => {
      const originalScenario = demoMetrics.scenario;
      const originalVSync = engine.vSyncCount;
      const originalTargetFrameRate = engine.targetFrameRate;
      const results: BuoyancyFrameRateResult[] = [];
      setStatus("checking 30 / 60 / 120 render FPS", "loading");
      engine.vSyncCount = 0;
      try {
        for (const targetFrameRate of FRAME_RATE_TARGETS) {
          engine.targetFrameRate = targetFrameRate;
          selectScenario("static-single");
          const renderStartFrame = updateScript.renderFrameCount;
          const renderStartMs = performance.now();
          const stability = await runDwellGate(
            "static-single",
            STATIC_SINGLE_EXPECTED_BODY_HEIGHT,
            isStaticBodyAcceptable
          );
          if (!activeBody) throw new Error("Frame-rate validation lost the active body.");
          const renderElapsedMs = performance.now() - renderStartMs;
          const renderFrameCount = updateScript.renderFrameCount - renderStartFrame;
          const rotation = activeBody.entity.transform.worldRotation;
          results.push(
            freezeStabilityResult({
              ...stability,
              targetFrameRate,
              renderFrameCount,
              renderElapsedMs,
              actualRenderFps: renderElapsedMs > 0 ? (renderFrameCount * 1000) / renderElapsedMs : 0,
              bodyHeight: activeBody.entity.transform.worldPosition.y,
              rollDegrees: normalizeAngle(rotation.z),
              pitchDegrees: normalizeAngle(rotation.x),
              linearSpeed: activeBody.collider.linearVelocity.length()
            })
          );
        }
        if (results.some((result) => result.fixedTimeStep !== results[0].fixedTimeStep)) {
          throw new Error("Frame-rate validation changed the fixed physics step across render targets.");
        }
      } finally {
        engine.targetFrameRate = originalTargetFrameRate;
        engine.vSyncCount = originalVSync;
        selectScenario(originalScenario);
      }
      const frozenResults = Object.freeze(results);
      demoMetrics.frameRateResults = frozenResults;
      setStatus("frame-rate consistency ready", "ready");
      return frozenResults;
    })().finally(() => {
      frameRateRun = null;
    });
    return frameRateRun;
  };

  const createAllocationProbeSnapshot = (state: AllocationProbeState): BuoyancyAllocationProbeSnapshot => {
    let queriesPerStep = 0;
    let appliedForcesPerStep = 0;
    for (const component of state.components) {
      queriesPerStep += component.lastStepQueryCount;
      appliedForcesPerStep += component.lastStepAppliedForceCount;
    }
    const expectedQueriesPerStep = state.components.length * 4;
    return Object.freeze({
      ready:
        state.stepCounter.stepCount >= ALLOCATION_PROBE_WARMUP_STEPS &&
        state.horizontalDragEnabled &&
        queriesPerStep === expectedQueriesPerStep &&
        state.preflight.allInsideFootprint &&
        state.preflight.allExpectedSource,
      surfaceKind: "reach",
      bodyCount: state.components.length,
      pontoonCount: 4,
      horizontalDragEnabled: state.horizontalDragEnabled,
      queriesPerStep,
      appliedForcesPerStep,
      expectedQueriesPerStep,
      preflightPontoonCount: state.preflight.pontoonCount,
      preflightAllInsideFootprint: state.preflight.allInsideFootprint,
      preflightAllExpectedSource: state.preflight.allExpectedSource,
      warmupSteps: state.stepCounter.stepCount,
      fixedTimeStep: scene.physics.fixedTimeStep
    });
  };

  const disposeAllocationProbe = (restoreStream = true): void => {
    const currentProbe = allocationProbe;
    allocationProbe = null;
    currentProbe?.root.destroy();
    bodyRoot.isActive = true;
    if (restoreStream && riverDriftAutoEnabled && demoMetrics.scenario === "river-four") {
      riverDriftSpawner.reset(riverDriftSeed);
      riverDriftSpawner.start();
    }
  };

  const getAllocationProbeSnapshot = (): BuoyancyAllocationProbeSnapshot | null =>
    allocationProbe ? createAllocationProbeSnapshot(allocationProbe) : null;

  const prepareAllocationProbe = async (): Promise<BuoyancyAllocationProbeSnapshot> => {
    if (profileRun || frameRateRun) throw new Error("Allocation probe cannot overlap another validation run.");
    disposeAllocationProbe(false);
    riverDriftSpawner.pause();
    riverDriftSpawner.clear();
    bodyRoot.isActive = false;
    try {
      const createdCase = createProfileCase(100, 4, "reach", false, true, "allocation-probe-reach-100x4-horizontal-on");
      const stepCounter = createdCase.root.addComponent(PhysicsStepCounter);
      allocationProbe = { ...createdCase, stepCounter };
      await waitUntil(() => {
        const snapshot = allocationProbe ? createAllocationProbeSnapshot(allocationProbe) : null;
        return snapshot?.ready === true;
      }, 20000);
      return createAllocationProbeSnapshot(allocationProbe);
    } catch (error) {
      disposeAllocationProbe();
      throw error;
    }
  };

  const updateScript = root.addComponent(DemoUpdateScript);
  updateScript.callback = updateMetrics;
  const api = Object.freeze<WaterBuoyancyDemoApi>({
    get metrics(): WaterBuoyancyDemoMetrics {
      return createMetricsSnapshot();
    },
    selectScenario,
    reset,
    perturb,
    runSleepWakeCheck,
    runOffshoreCheck,
    runKinematicCheck,
    runParentTransformCheck,
    runRenderParityCheck,
    runSinglePontoonGate,
    runRecoveryGate,
    runCurrentForceCheck,
    runRiverDriftGate,
    runPerformanceMatrix,
    runFrameRateConsistency,
    prepareAllocationProbe,
    getAllocationProbeSnapshot,
    disposeAllocationProbe
  });
  Object.defineProperty(window, "waterBuoyancyDemo", {
    value: api,
    configurable: false,
    enumerable: true,
    writable: false
  });

  for (const button of scenarioButtons) {
    button.addEventListener("click", () => selectScenario(parseBuoyancyScenario(button.dataset.scenario ?? null)));
  }
  resetButton.addEventListener("click", reset);
  perturbButton.addEventListener("click", perturb);
  profileButton.addEventListener("click", () => void runPerformanceMatrix());

  selectScenario(demoMetrics.scenario);
  engine.run();

  window.addEventListener("beforeunload", () => {
    window.removeEventListener("resize", resizeCanvas);
    disposeAllocationProbe(false);
    riverDriftSpawner.destroyStream();
    destroyActiveBody();
    riverBed.destroy();
    riverRuntime.destroy();
    riverResource.dispose();
    profileRiverRuntime.destroy();
    profileRiverResource.dispose();
    compileWorker.dispose();
    bodyMaterial.destroy(true);
    root.destroy();
    sharedPhysicsMaterial.destroy();
    engine.destroy();
  });
}

setStatus("initializing PhysX", "loading");
bootstrapBuoyancyDemo().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  demoMetrics.runtimeError = message;
  demoMetrics.ready = false;
  writeMetric("error", message);
  setStatus("initialization failed", "error");
  console.error(error);
});
