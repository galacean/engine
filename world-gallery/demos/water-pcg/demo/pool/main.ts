/** Standalone Galacean + PhysX runtime for the interactive indoor pool. */
import { Camera, Color, Layer, Script, Vector3, WebGLEngine, WebGLMode } from "@galacean/engine";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { RectangularWaterHeightField } from "../../runtime/interaction/RectangularWaterHeightField";
import { InteractivePoolSurfaceProvider } from "../../runtime/interaction/InteractivePoolSurfaceProvider";
import { RiverCompileWorkerClient } from "../../runtime/river/RiverCompileWorkerClient";
import { RiverRuntimeController } from "../../runtime/river/RiverRuntimeController";
import { RiverWaterSurfaceProvider } from "../../runtime/river/RiverWaterSurfaceProvider";
import { createWaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";
import { RiverCameraFeatureController } from "../RiverCameraFeatureController";
import { PoolSceneController, createPoolSceneLayout } from "../decoration/PoolSceneController";
import { RiverBedController } from "../decoration/RiverBedController";
import { WaterDecorationStyle } from "../decoration/constants";
import { indoorReflectivePoolExample } from "../examples/pool/indoorReflectivePool";
import { InteractivePoolSurfaceController } from "./InteractivePoolSurfaceController";
import { PoolBallSpawner } from "./PoolBallSpawner";
import { PoolBodyFleet } from "./PoolBodyFleet";
import {
  POOL_P1_BODY_COUNTS,
  resolvePoolP1DeviceDefaults,
  resolvePoolP1ShowcaseConfig,
  type PoolLocalEffectsDebugView,
  type PoolP1BodyCount
} from "./PoolP1ShowcaseConfig";
import { PoolPhysicsSceneController } from "./PoolPhysicsSceneController";
import { TemporalFoamTextureService } from "./TemporalFoamTextureService";
import { WaterShowcaseFrameSampler } from "../showcase/WaterShowcaseAcceptance";
import { createFeatureSnapshot, type WaterFeatureCaseApi } from "../showcase/WaterFeatureCaseApi";
import type {
  InteractivePoolGridQuality,
  InteractivePoolMetrics,
  InteractivePoolOpticalContinuityReadback,
  InteractivePoolOpticalMediumReadback,
  InteractivePoolP1Metrics,
  InteractivePoolUnderwaterPreset
} from "./types";
import { getWaterBodyCapabilities } from "../../runtime/body/WaterBodyCapabilities";
import { WaterBodyRuntimeAdapter } from "../../runtime/body/WaterBodyRuntime";
import { WaterP0DebugController } from "../../runtime/body/WaterP0DebugApi";
import { WaterWorld } from "../../runtime/body/WaterWorld";
import { SurfaceDepthWaterVolumeProvider } from "../../runtime/body/SurfaceDepthWaterVolumeProvider";
import { CameraWaterFeatureBroker } from "../../runtime/optics/CameraWaterFeatureBroker";
import { UnderwaterController } from "../../runtime/optics/UnderwaterController";
import { WaterReflectionService } from "../../runtime/optics/WaterReflectionService";
import {
  createResolvedWaterOpticalProfileFingerprint,
  UnderwaterPostProcessPass
} from "../../runtime/optics/UnderwaterPostProcessPass";
import { evaluateWaterOpticalMedium, type WaterOpticalProfile } from "../../runtime/optics/WaterOpticalProfile";
import { resolveWaterSurfaceOpticalProfile } from "../../runtime/optics/WaterSurfaceOpticsBinding";
import {
  WaterOpticsDebugView,
  type ResolvedWaterOpticalProfile,
  type WaterOpticsTier
} from "../../runtime/optics/WaterSurfaceOpticsTypes";
import { RectangularWaterDeformationProvider } from "../../runtime/interaction/RectangularWaterDeformationProvider";
import { TemporalFoamField } from "../../runtime/interaction/TemporalFoamField";
import {
  PoolSurfaceUploadStrategy,
  resolvePoolSurfaceUploadPolicy
} from "../../runtime/interaction/PoolSurfaceUploadPolicy";
import {
  WaterInteractionEventKind,
  WaterInteractionEventQueue,
  createWaterInteractionEvent,
  type WaterInteractionEventConsumer
} from "../../runtime/interaction/WaterInteractionEventQueue";
import { WaterInteractionSinkAdapter } from "../../runtime/interaction/WaterInteractionSinkAdapter";
import type { WaterSurfaceInteractionSink } from "../../runtime/interaction/WaterSurfaceInteractionSink";
import { WaterLocalFieldComposer } from "../../runtime/interaction/WaterLocalFieldComposer";
import { WaterLocalModifierChannel } from "../../runtime/interaction/WaterLocalFieldProvider";
import { WaterLocalModifierBlendMode } from "../../runtime/interaction/WaterLocalModifier";
import { WaterSurfaceCurrentFieldProvider } from "../../runtime/interaction/WaterSurfaceCurrentFieldProvider";
import { createUniformWaterCurrentFieldSnapshot } from "../../runtime/interaction/WaterCurrentFieldSnapshot";
import { POOL_WATER_OPTICAL_PROFILE } from "./PoolWaterOptics";
import {
  createShowcaseCameraController,
  resolveShowcaseCameraMode,
  SHOWCASE_CAMERA_MOVEMENT_SPEED,
  type ShowcaseCameraController
} from "../showcase/ShowcaseCameraControl";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

const search = new URLSearchParams(window.location.search);
const browserDevice = navigator as Navigator & { readonly deviceMemory?: number };
const p1DeviceDefaults = resolvePoolP1DeviceDefaults({
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemoryGb: browserDevice.deviceMemory
});
const p1Config = resolvePoolP1ShowcaseConfig(
  window.location,
  p1DeviceDefaults.bodyCount,
  document.documentElement.dataset.waterPcgPreset
);
const showcaseCameraMode = p1Config.preset === "hero-pool" ? resolveShowcaseCameraMode(search, true) : undefined;
const requestedQuality = search.get("quality");
const quality: InteractivePoolGridQuality =
  requestedQuality === "low" || requestedQuality === "medium" || requestedQuality === "high"
    ? requestedQuality
    : p1Config.preset === "p1-diagnostics"
      ? p1DeviceDefaults.quality
      : p1Config.defaultQuality;
const resolutionX = quality === "low" ? 65 : 129;
const resolutionZ = quality === "low" ? 27 : 53;
const P1_EVENT_QUEUE_CAPACITY = 128;
const P1_EMITTER_CAPACITY = 16;
const P1_FOAM_RESOLUTION_X = 128;
const P1_FOAM_RESOLUTION_Z = 64;
const POOL_UNIFORM_CURRENT_EPSILON = 1e-5;
const OPTICAL_CONTINUITY_DISTANCE_METERS = 1.25;
const OPTICAL_CONTINUITY_SOURCE_LINEAR_COLOR = Object.freeze([0.62, 0.48, 0.31] as const);
const centerQueryPosition = new Vector3();
const centerSurfaceSample = createWaterSurfaceSample();
const showcaseFrameSampler = new WaterShowcaseFrameSampler(300);

function snapshotResolvedOpticalProfile(
  profile: Readonly<ResolvedWaterOpticalProfile>
): Readonly<ResolvedWaterOpticalProfile> {
  return Object.freeze({
    absorptionCoefficient: Object.freeze([...profile.absorptionCoefficient] as [number, number, number]),
    scatteringColor: Object.freeze([...profile.scatteringColor] as [number, number, number]),
    scatteringCoefficient: profile.scatteringCoefficient,
    maximumViewDistance: profile.maximumViewDistance,
    indexOfRefraction: profile.indexOfRefraction,
    fresnelF0: profile.fresnelF0,
    maximumSurfaceOpticalDistance: profile.maximumSurfaceOpticalDistance,
    refractionStrength: profile.refractionStrength,
    roughness: profile.roughness,
    reflectionIntensity: profile.reflectionIntensity
  });
}

function resolvedProfileValues(profile: Readonly<ResolvedWaterOpticalProfile>): readonly number[] {
  return [
    ...profile.absorptionCoefficient,
    ...profile.scatteringColor,
    profile.scatteringCoefficient,
    profile.maximumViewDistance,
    profile.indexOfRefraction,
    profile.fresnelF0,
    profile.maximumSurfaceOpticalDistance,
    profile.refractionStrength,
    profile.roughness,
    profile.reflectionIntensity
  ];
}

function maximumAbsoluteDelta(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) return Number.POSITIVE_INFINITY;
  let maximum = 0;
  for (let index = 0; index < left.length; index++) maximum = Math.max(maximum, Math.abs(left[index] - right[index]));
  return maximum;
}

function evaluateOpticalContinuityMedium(profile: WaterOpticalProfile): Readonly<InteractivePoolOpticalMediumReadback> {
  const outColor = { red: 0, green: 0, blue: 0 };
  evaluateWaterOpticalMedium(
    profile,
    OPTICAL_CONTINUITY_DISTANCE_METERS,
    {
      red: OPTICAL_CONTINUITY_SOURCE_LINEAR_COLOR[0],
      green: OPTICAL_CONTINUITY_SOURCE_LINEAR_COLOR[1],
      blue: OPTICAL_CONTINUITY_SOURCE_LINEAR_COLOR[2]
    },
    outColor
  );
  return Object.freeze({
    opticalDistanceMeters: OPTICAL_CONTINUITY_DISTANCE_METERS,
    sourceLinearColor: OPTICAL_CONTINUITY_SOURCE_LINEAR_COLOR,
    mediumLinearColor: Object.freeze([outColor.red, outColor.green, outColor.blue] as const)
  });
}

const metrics: Mutable<InteractivePoolMetrics> = {
  ready: false,
  runtimeError: "",
  finite: true,
  quality,
  ballSpawned: false,
  ballHeight: 0,
  ballVerticalSpeed: 0,
  ballInWater: false,
  initialBallHeightAboveSurface: 0,
  freeFallObserved: false,
  upwardBounceObserved: false,
  settled: false,
  entryImpactCount: 0,
  continuousInteractionCount: 0,
  contactInteractionCount: 0,
  firstImpactTime: 0,
  maximumAbsSurfaceHeight: 0,
  centerSurfaceHeight: 0,
  centerSurfaceVerticalSpeed: 0,
  currentContactDepression: 0,
  maximumContactDepression: 0,
  currentContactRimHeight: 0,
  maximumContactRimHeight: 0,
  rippleRadius: 0,
  reflectedWaveObserved: false,
  rippleHighlightPeak: 0,
  maximumHighlightedVertexCount: 0,
  surfaceVertexCount: 0,
  meshUploadsPerRenderFrame: 0,
  totalMeshUploads: 0,
  physicsFixedTimeStep: 0,
  renderFrameCount: 0,
  targetFrameRate: 60
};

const p1Metrics: Mutable<InteractivePoolP1Metrics> = {
  enabled: p1Config.enabled,
  bodyCount: p1Config.bodyCount,
  bodyCountSelection: p1Config.bodyCountSelection,
  additionalBodyCount: 0,
  drivingBodyCount: 0,
  submergedBodyCount: 0,
  maximumHorizontalSpeed: 0,
  dynamicEffectsEnabled: p1Config.enabled,
  modifierCount: 0,
  queueCapacity: P1_EVENT_QUEUE_CAPACITY,
  emitterCapacity: P1_EMITTER_CAPACITY,
  queuedEventCount: 0,
  acceptedEventCount: 0,
  droppedEventCount: 0,
  aggregatedEventCount: 0,
  stationaryRejectedEventCount: 0,
  peakQueuedEventCount: 0,
  debugView: p1Config.localEffectsDebugView,
  temporalFoamEnabled: p1Config.temporalFoamEnabled && quality !== "low",
  foamSourceInjectionCount: 0,
  foamActiveHistoryPixelCount: 0,
  foamPeakHistoryValue: 0,
  foamHistoryEnergy: 0,
  foamActiveLifetimeSeconds: 0,
  foamMaximumLifetimeSeconds: 0,
  foamCentroidDriftDistance: 0,
  foamUpdateCount: 0,
  foamIdleSkipCount: 0,
  foamTextureUploadsPerRenderFrame: 0,
  foamTextureUploadCount: 0,
  foamResourceBytes: 0,
  foamCurrentSnapshotKind: "none",
  foamCurrentSnapshotRevision: -1,
  foamCurrentSnapshotBuildCount: 0,
  foamCurrentLookupCount: 0,
  foamFullSurfaceQueryCount: 0,
  foamTargetUpdateRateHz: 0,
  foamRateLimitedFrameCount: 0,
  foamLastStepDeltaSeconds: 0,
  surfaceUploadStrategy: PoolSurfaceUploadStrategy.CpuInterpolated,
  surfaceUploadPolicySelection: "caller-fallback",
  estimatedSurfaceUploadBytesPerFrame: 0,
  querySource: "cpu-height-field",
  requiresGpuReadback: false,
  surfaceOpticsRequestedTier: "medium",
  surfaceOpticsResolvedTier: "medium",
  surfaceReflectionSource: "sky",
  surfaceRefractionEnabled: true,
  sharesUnderwaterOpticalProfile: true
};

function createMetricsSnapshot(): InteractivePoolMetrics {
  return Object.freeze({ ...metrics });
}

Object.defineProperty(window, "waterPcgInteractivePoolMetrics", {
  configurable: true,
  enumerable: true,
  get: createMetricsSnapshot
});

const statusCandidate = document.getElementById("interactive-pool-status");
const metricsCandidate = document.getElementById("interactive-pool-metrics");
const resetCandidate = document.getElementById("interactive-pool-reset");

if (
  !(statusCandidate instanceof HTMLSpanElement) ||
  !(metricsCandidate instanceof HTMLDListElement) ||
  !(resetCandidate instanceof HTMLButtonElement)
) {
  throw new Error("Interactive pool HUD is missing required elements.");
}

const statusElement: HTMLSpanElement = statusCandidate;
const metricsElement: HTMLDListElement = metricsCandidate;
const resetButton: HTMLButtonElement = resetCandidate;

function setStatus(message: string, state: "loading" | "ready" | "error"): void {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function writeMetric(name: string, value: string): void {
  const element = metricsElement.querySelector(`[data-metric="${name}"]`);
  if (element) element.textContent = value;
}

class PoolMetricsUpdateScript extends Script {
  callback: ((deltaTime: number) => void) | null = null;

  onUpdate(deltaTime: number): void {
    this.callback?.(deltaTime);
  }
}

async function bootstrapInteractivePool(): Promise<void> {
  const compileWorker = new RiverCompileWorkerClient();
  const riverResource = await compileWorker.compile(indoorReflectivePoolExample.riverDescriptor);
  const data = riverResource.data;
  const layout = createPoolSceneLayout(data);
  const reach = data.reaches[0];
  const samples = reach?.artifact.samples;
  if (!layout || !reach || !samples || samples.length < 2) {
    riverResource.dispose();
    compileWorker.dispose();
    throw new Error("Indoor pool compilation did not produce a rectangular reach layout.");
  }

  const engineConfiguration = {
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    physics: new PhysXPhysics(),
    graphicDeviceOptions: {
      webGLMode: WebGLMode.WebGL2,
      preserveDrawingBuffer: search.get("visual") === "1"
    }
  } as unknown as Parameters<typeof WebGLEngine.create>[0];
  const engine = await WebGLEngine.create(engineConfiguration);
  engine.canvas.resizeByClientSize();
  const resizeCanvas = (): void => engine.canvas.resizeByClientSize();
  window.addEventListener("resize", resizeCanvas);

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(...indoorReflectivePoolExample.view.backgroundColor);
  scene.ambientLight.diffuseSolidColor.set(0.48, 0.56, 0.58, 1);
  scene.ambientLight.diffuseIntensity = 0.78;
  const root = scene.createRootEntity("interactive-indoor-pool-demo");
  const cameraEntity = root.createChild("camera");
  cameraEntity.transform.setPosition(...indoorReflectivePoolExample.view.cameraPosition);
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 260;
  camera.fieldOfView = 32;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.target.set(...indoorReflectivePoolExample.view.cameraTarget);
  orbit.minDistance = 8;
  orbit.maxDistance = 150;
  orbit.enabled = p1Config.preset !== "hero-pool";
  cameraEntity.transform.lookAt(orbit.target);
  let showcaseCameraController: ShowcaseCameraController | undefined;
  const cameraFeatureBroker = new CameraWaterFeatureBroker(camera);
  cameraFeatureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);
  const syncCameraFeatureViewport = (): void =>
    cameraFeatureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);
  window.addEventListener("resize", syncCameraFeatureViewport);
  const cameraFeatures = new RiverCameraFeatureController(camera, cameraFeatureBroker);
  cameraFeatures.apply(true, reach.config.quality.material.level);
  const reflectionServiceLease = WaterReflectionService.acquire(engine, root, camera);
  const reflectionService = reflectionServiceLease.service;
  const syncReflectionViewport = (): void =>
    reflectionService.setViewportSize(engine.canvas.width, engine.canvas.height);
  syncReflectionViewport();
  window.addEventListener("resize", syncReflectionViewport);
  cameraFeatureBroker.setRequest("pool-showcase-reflection", {
    depthTexture: false,
    opaqueTexture: false,
    reflection: "planar",
    caustics: false,
    underwater: false,
    quality
  });
  const underwaterPass = new UnderwaterPostProcessPass(engine);
  underwaterPass.setOpticalProfile(POOL_WATER_OPTICAL_PROFILE);
  engine.addPostProcessPass(underwaterPass);

  const riverRoot = root.createChild("interactive-pool-river-base");
  const riverRuntime = new RiverRuntimeController(engine, riverRoot);
  riverRuntime.setSurfaceFeatureFlags(true, true);
  riverRuntime.activate(data.sourceId, riverResource);
  riverRuntime.applyPresentation(0, { surfaceVisible: false, foamVisible: false });
  const baseProvider = new RiverWaterSurfaceProvider(riverRuntime);

  const riverBed = new RiverBedController(engine, root);
  riverBed.rebuild(data, WaterDecorationStyle.Pool);
  const poolScene = new PoolSceneController(engine, root);
  poolScene.rebuild(data);
  const poolPhysics = new PoolPhysicsSceneController(engine, root, layout);

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const axisX = lastSample.position[0] - firstSample.position[0];
  const axisZ = lastSample.position[2] - firstSample.position[2];
  const axisLength = Math.hypot(axisX, axisZ);
  if (axisLength <= Number.EPSILON) throw new Error("Indoor pool reach has no horizontal direction.");
  const poolCanvas = document.getElementById("canvas");
  const autoTourRequested = showcaseCameraMode === "tour";
  let autoTourActive = autoTourRequested;
  const pauseAutoTour = (): void => {
    if (!autoTourActive) return;
    autoTourActive = false;
    showcaseCameraController?.setFreeControlActive(true);
  };
  const handleCameraKeyDown = (event: KeyboardEvent): void => {
    if (
      event.code === "KeyW" ||
      event.code === "KeyA" ||
      event.code === "KeyS" ||
      event.code === "KeyD" ||
      event.code.startsWith("Arrow")
    ) {
      pauseAutoTour();
    }
  };
  poolCanvas?.addEventListener("pointerdown", pauseAutoTour);
  poolCanvas?.addEventListener("wheel", pauseAutoTour, { passive: true });
  window.addEventListener("keydown", handleCameraKeyDown);
  const referenceCurrentX = firstSample.tangent[0] * firstSample.flowSpeed;
  const referenceCurrentZ = firstSample.tangent[2] * firstSample.flowSpeed;
  if (
    p1Config.enabled &&
    samples.some(
      (sample) =>
        Math.hypot(
          sample.tangent[0] * sample.flowSpeed - referenceCurrentX,
          sample.tangent[2] * sample.flowSpeed - referenceCurrentZ
        ) > POOL_UNIFORM_CURRENT_EPSILON
    )
  ) {
    throw new Error("Interactive pool temporal foam requires one uniform compiled horizontal current.");
  }
  const temporalFoamCurrentSnapshot = p1Config.enabled
    ? createUniformWaterCurrentFieldSnapshot({
        revision: 0,
        currentX: referenceCurrentX,
        currentZ: referenceCurrentZ
      })
    : undefined;
  p1Metrics.foamCurrentSnapshotKind = temporalFoamCurrentSnapshot?.kind ?? "none";
  p1Metrics.foamCurrentSnapshotRevision = temporalFoamCurrentSnapshot?.revision ?? -1;
  p1Metrics.foamCurrentSnapshotBuildCount = temporalFoamCurrentSnapshot ? 1 : 0;
  const heightField = new RectangularWaterHeightField({
    centerX: layout.position[0],
    centerZ: layout.position[2],
    lengthAxisX: axisX / axisLength,
    lengthAxisZ: axisZ / axisLength,
    length: layout.length,
    width: layout.width,
    resolutionX,
    resolutionZ,
    waveSpeed: 4,
    damping: 0.55,
    maxDisplacement: 0.25,
    maximumCfl: 0.9,
    interactionQueueCapacity: 8
  });
  const provider = new InteractivePoolSurfaceProvider(baseProvider, heightField);
  const volumeProvider = new SurfaceDepthWaterVolumeProvider(provider);
  const halfLength = layout.length * 0.5;
  const halfWidth = layout.width * 0.5;
  const extentX = Math.abs(axisX / axisLength) * halfLength + Math.abs(axisZ / axisLength) * halfWidth;
  const extentZ = Math.abs(axisZ / axisLength) * halfLength + Math.abs(axisX / axisLength) * halfWidth;
  const poolBounds = Object.freeze({
    minX: layout.position[0] - extentX,
    minZ: layout.position[2] - extentZ,
    maxX: layout.position[0] + extentX,
    maxZ: layout.position[2] + extentZ
  });
  const localField = new WaterLocalFieldComposer("interactive-pool");
  const deformationProvider = new RectangularWaterDeformationProvider(heightField);
  const currentProvider = new WaterSurfaceCurrentFieldProvider(provider);
  localField.register(
    {
      id: "interactive-pool-current",
      bodyId: "interactive-pool",
      bounds: poolBounds,
      channels: WaterLocalModifierChannel.CurrentLarge,
      priority: 0,
      blendMode: WaterLocalModifierBlendMode.Add,
      dynamic: false
    },
    currentProvider
  );
  localField.register(
    {
      id: "interactive-pool-deformation",
      bodyId: "interactive-pool",
      bounds: poolBounds,
      channels: WaterLocalModifierChannel.DisplacementY,
      priority: 10,
      blendMode: WaterLocalModifierBlendMode.Add,
      dynamic: true
    },
    deformationProvider
  );
  const waterWorld = new WaterWorld();
  waterWorld.register(
    new WaterBodyRuntimeAdapter({
      id: "interactive-pool",
      type: "pool",
      capabilities: getWaterBodyCapabilities("pool"),
      surface: provider,
      localField,
      volume: volumeProvider,
      opticalProfile: POOL_WATER_OPTICAL_PROFILE,
      bounds: poolBounds,
      priority: 20,
      metrics: {
        meshUploadCount: 0,
        drawCount: 1,
        triangleCount: (resolutionX - 1) * (resolutionZ - 1) * 2,
        resourceBytes: riverResource.byteLength
      }
    })
  );
  const waterP0Debug = new WaterP0DebugController(waterWorld);
  window.waterPcgP0 = waterP0Debug;
  metricsElement.dataset.waterCapabilityMatrix = JSON.stringify(waterP0Debug.capabilityMatrix);
  metricsElement.dataset.waterWorldBodyCount = String(waterWorld.metrics.registeredBodyCount);

  const surfaceDriverEntity = root.createChild("interactive-pool-surface-driver");
  const surfaceController = surfaceDriverEntity.addComponent(InteractivePoolSurfaceController);
  surfaceController.configure({ engine, parent: root, compiledData: data, heightField });
  const surfaceOpticsTier: WaterOpticsTier = quality === "high" ? "high" : "medium";
  const reflectionConsumerId = "pool-showcase-surface";
  reflectionService.setRequest({
    id: reflectionConsumerId,
    preferredSource: "planar",
    quality,
    visible: true,
    priority: 100,
    planeY: layout.position[1],
    cullingMask: Layer.Everything,
    waterLayerMask: Layer.Layer30
  });
  reflectionService.update(0);
  const applySurfaceOpticsBinding = () =>
    surfaceController.setSurfaceOpticsBinding({
      tier: surfaceOpticsTier,
      opticalProfile: POOL_WATER_OPTICAL_PROFILE,
      refractionEnabled: true,
      reflection: reflectionService.getBinding(reflectionConsumerId),
      reflectionSampling: {
        highFilterSampleCount: quality === "high" ? 5 : 1
      },
      debugView: WaterOpticsDebugView.Final
    });
  const surfaceOpticsReadback = applySurfaceOpticsBinding();
  if (!surfaceOpticsReadback) throw new Error("Interactive pool surface optics binding was not applied.");
  p1Metrics.surfaceOpticsRequestedTier = surfaceOpticsReadback.requestedTier;
  p1Metrics.surfaceOpticsResolvedTier = surfaceOpticsReadback.resolvedTier;
  p1Metrics.surfaceReflectionSource = surfaceOpticsReadback.effectiveSource;
  p1Metrics.surfaceRefractionEnabled = surfaceOpticsReadback.refractionEnabled;
  surfaceController.configureTemporalFoamRegion({
    minX: poolBounds.minX,
    minZ: poolBounds.minZ,
    inverseSizeX: 1 / (poolBounds.maxX - poolBounds.minX),
    inverseSizeZ: 1 / (poolBounds.maxZ - poolBounds.minZ)
  });
  const uploadPolicy = resolvePoolSurfaceUploadPolicy({
    simulationSampleCount: heightField.sampleCount,
    renderVertexCount: surfaceController.surfaceVertexCount,
    capabilities: { vertexTextureFetch: true, r8TextureUpload: true },
    fallbackStrategy: PoolSurfaceUploadStrategy.CpuInterpolated
  });
  p1Metrics.surfaceUploadStrategy = uploadPolicy.strategy;
  p1Metrics.surfaceUploadPolicySelection = uploadPolicy.selection;
  p1Metrics.estimatedSurfaceUploadBytesPerFrame = uploadPolicy.estimatedUploadBytesPerFrame;
  p1Metrics.modifierCount = localField.modifierCount;

  const interactionQueue = new WaterInteractionEventQueue(P1_EVENT_QUEUE_CAPACITY, P1_EMITTER_CAPACITY);
  let interactionFeatureEnabled = true;
  const interactionSinks = new Map<number, WaterInteractionSinkAdapter>();
  const gatedInteractionSinks = new Map<number, WaterSurfaceInteractionSink>();
  const createInteractionSink = (emitterId: number): WaterSurfaceInteractionSink => {
    const existing = gatedInteractionSinks.get(emitterId);
    if (existing) return existing;
    const adapter = new WaterInteractionSinkAdapter({
      queue: interactionQueue,
      emitterId,
      deformationSink: heightField,
      minimumTrailDistance: 0.28,
      minimumTrailSpeed: 0.18
    });
    const sink: WaterSurfaceInteractionSink = {
      registerInteraction(
        worldPosition,
        surfaceNormal,
        relativeVelocity,
        radius,
        submergedRatio,
        enteredWater
      ): boolean {
        return (
          interactionFeatureEnabled &&
          adapter.registerInteraction(
            worldPosition,
            surfaceNormal,
            relativeVelocity,
            radius,
            submergedRatio,
            enteredWater
          )
        );
      }
    };
    interactionSinks.set(emitterId, adapter);
    gatedInteractionSinks.set(emitterId, sink);
    return sink;
  };
  const temporalFoamField = p1Config.enabled
    ? new TemporalFoamField({
        centerX: layout.position[0],
        centerZ: layout.position[2],
        length: poolBounds.maxX - poolBounds.minX,
        width: poolBounds.maxZ - poolBounds.minZ,
        resolutionX: P1_FOAM_RESOLUTION_X,
        resolutionZ: P1_FOAM_RESOLUTION_Z,
        decayRatePerSecond: 0.8
      })
    : null;
  const temporalFoamTextures = temporalFoamField
    ? new TemporalFoamTextureService(engine, temporalFoamField, {
        enabled: p1Config.temporalFoamEnabled,
        quality: quality === "high" ? "medium" : quality,
        debugView: p1Config.localEffectsDebugView
      })
    : null;
  let dynamicEffectsEnabled = p1Config.enabled;
  const interactionEvent = createWaterInteractionEvent();
  const foamConsumer: WaterInteractionEventConsumer = {
    consumeInteractionEvent(queue, index): void {
      if (
        !dynamicEffectsEnabled ||
        !temporalFoamField ||
        !temporalFoamTextures?.metrics.enabled ||
        !queue.read(index, interactionEvent)
      )
        return;
      const entryScale = interactionEvent.kind === WaterInteractionEventKind.Entry ? 1.55 : 1.1;
      const strengthScale = interactionEvent.kind === WaterInteractionEventKind.Entry ? 0.34 : 0.48;
      temporalFoamField.addSourceWorld(
        interactionEvent.worldX,
        interactionEvent.worldZ,
        interactionEvent.radius * entryScale,
        Math.min(1, interactionEvent.strength * strengthScale)
      );
    }
  };
  const ballInteractionTarget: WaterSurfaceInteractionSink = p1Config.enabled ? createInteractionSink(0) : heightField;
  const ballInteractionSink: WaterSurfaceInteractionSink = {
    registerInteraction(worldPosition, surfaceNormal, relativeVelocity, radius, submergedRatio, enteredWater): boolean {
      return (
        interactionFeatureEnabled &&
        ballInteractionTarget.registerInteraction(
          worldPosition,
          surfaceNormal,
          relativeVelocity,
          radius,
          submergedRatio,
          enteredWater
        )
      );
    }
  };
  const ballSpawnerEntity = root.createChild("interactive-pool-ball-spawner");
  const ballSpawner = ballSpawnerEntity.addComponent(PoolBallSpawner);
  ballSpawner.configure({
    engine,
    surfaceProvider: provider,
    interactionSink: ballInteractionSink,
    spawnCenterX: layout.position[0],
    spawnCenterZ: layout.position[2]
  });
  const fleetEntity = root.createChild("p1-pool-body-fleet");
  const bodyFleet = fleetEntity.addComponent(PoolBodyFleet);
  bodyFleet.configure({
    engine,
    surfaceProvider: provider,
    createInteractionSink,
    centerX: layout.position[0],
    centerZ: layout.position[2],
    lengthAxisX: axisX / axisLength,
    lengthAxisZ: axisZ / axisLength,
    length: layout.length,
    width: layout.width
  });
  bodyFleet.setAdditionalBodyCount(p1Config.enabled ? p1Config.bodyCount - 1 : 0);
  const underwaterController = new UnderwaterController({
    world: waterWorld,
    getCameraPosition: () => cameraEntity.transform.worldPosition,
    cameraFeatures: cameraFeatureBroker,
    postProcess: underwaterPass,
    fallbackOpticalProfile: POOL_WATER_OPTICAL_PROFILE,
    quality
  });

  const createOpticalContinuityReadback = (): Readonly<InteractivePoolOpticalContinuityReadback> => {
    const surfaceResolvedProfile = snapshotResolvedOpticalProfile(surfaceOpticsReadback.opticalProfile);
    const underwaterResolvedProfile = snapshotResolvedOpticalProfile(underwaterPass.resolvedOpticalProfile);
    const activeProfile = underwaterController.activeOpticalProfile;
    const activeResolvedProfile = activeProfile ? resolveWaterSurfaceOpticalProfile(activeProfile) : undefined;
    const surfaceProfileFingerprint = createResolvedWaterOpticalProfileFingerprint(surfaceResolvedProfile);
    const underwaterProfileFingerprint = createResolvedWaterOpticalProfileFingerprint(underwaterResolvedProfile);
    const surfaceMediumReadback = evaluateOpticalContinuityMedium(surfaceResolvedProfile);
    const underwaterMediumReadback = evaluateOpticalContinuityMedium(underwaterResolvedProfile);
    const maximumResolvedProfileDelta = maximumAbsoluteDelta(
      resolvedProfileValues(surfaceResolvedProfile),
      resolvedProfileValues(underwaterResolvedProfile)
    );
    const maximumMediumColorDelta = maximumAbsoluteDelta(
      surfaceMediumReadback.mediumLinearColor,
      underwaterMediumReadback.mediumLinearColor
    );
    const postProcessMetrics = underwaterPass.metrics;
    const finiteValues = [
      ...resolvedProfileValues(surfaceResolvedProfile),
      ...resolvedProfileValues(underwaterResolvedProfile),
      ...surfaceMediumReadback.mediumLinearColor,
      ...underwaterMediumReadback.mediumLinearColor,
      maximumResolvedProfileDelta,
      maximumMediumColorDelta
    ];
    return Object.freeze({
      quality,
      surfaceResolvedProfile,
      underwaterResolvedProfile,
      surfaceProfileFingerprint,
      underwaterProfileFingerprint,
      shaderBoundUnderwaterProfileFingerprint: postProcessMetrics.shaderBoundOpticalProfileFingerprint,
      underwaterShaderProfileBindCount: postProcessMetrics.opticalProfileBindCount,
      configuredReferenceConsistent: underwaterPass.sourceOpticalProfile === POOL_WATER_OPTICAL_PROFILE,
      activeReferenceConsistent: activeProfile ? activeProfile === POOL_WATER_OPTICAL_PROFILE : null,
      activeProfileFingerprint: activeResolvedProfile
        ? createResolvedWaterOpticalProfileFingerprint(activeResolvedProfile)
        : "",
      maximumResolvedProfileDelta,
      surfaceMediumReadback,
      underwaterMediumReadback,
      maximumMediumColorDelta,
      finite: finiteValues.every(Number.isFinite)
    });
  };

  const setUnderwaterPreset = (preset: InteractivePoolUnderwaterPreset): void => {
    if (preset === "outside") {
      cameraEntity.transform.setPosition(...indoorReflectivePoolExample.view.cameraPosition);
      orbit.target.set(...indoorReflectivePoolExample.view.cameraTarget);
    } else {
      const lengthDirectionX = axisX / axisLength;
      const lengthDirectionZ = axisZ / axisLength;
      const cameraX = layout.position[0] - lengthDirectionX * 4.5;
      const cameraZ = layout.position[2] - lengthDirectionZ * 4.5;
      centerQueryPosition.set(cameraX, 0, cameraZ);
      if (!provider.sampleSurface(centerQueryPosition, centerSurfaceSample)) return;
      const surfaceHeight = centerSurfaceSample.surfacePosition.y;
      const cameraY =
        preset === "inside"
          ? Math.max(surfaceHeight - centerSurfaceSample.waterDepth + 0.45, surfaceHeight - 1.45)
          : surfaceHeight + 0.02;
      const targetY = preset === "inside" ? cameraY - 0.18 : surfaceHeight;
      cameraEntity.transform.setPosition(cameraX, cameraY, cameraZ);
      orbit.target.set(layout.position[0] + lengthDirectionX * 3, targetY, layout.position[2] + lengthDirectionZ * 3);
    }
    cameraEntity.transform.lookAt(orbit.target);
    underwaterController.update();
    showcaseCameraController?.syncFromTransform();
  };
  window.waterPcgUnderwater = {
    get isUnderwater() {
      return underwaterController.isUnderwater;
    },
    get activeBodyId() {
      return underwaterController.activeBodyId;
    },
    get signedSurfaceDistance() {
      return underwaterController.metrics.signedSurfaceDistance;
    },
    get submergedDepth() {
      return underwaterController.metrics.submergedDepth;
    },
    get transitionCount() {
      const underwaterMetrics = underwaterController.metrics;
      return underwaterMetrics.enterCount + underwaterMetrics.exitCount + underwaterMetrics.bodySwitchCount;
    },
    get passExecutionCount() {
      return underwaterController.metrics.postProcessExecutionCount;
    },
    get passMaterialAllocated() {
      return underwaterPass.metrics.materialAllocated;
    },
    get passMaterialCreateCount() {
      return underwaterPass.metrics.materialCreateCount;
    },
    get passMaterialDestroyCount() {
      return underwaterPass.metrics.materialDestroyCount;
    },
    get opticalContinuity() {
      return createOpticalContinuityReadback();
    },
    setPreset: setUnderwaterPreset
  };
  setUnderwaterPreset(p1Config.initialUnderwaterPreset);
  if (showcaseCameraMode) {
    showcaseCameraController = createShowcaseCameraController(cameraEntity, {
      mode: showcaseCameraMode,
      movementSpeed: SHOWCASE_CAMERA_MOVEMENT_SPEED.pool,
      afterCameraUpdate: () => {
        reflectionService.update(metrics.renderFrameCount);
        underwaterController.update();
      }
    });
  }
  const underwaterPresetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-underwater-preset]"));
  const handleUnderwaterPresetClick = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement)) return;
    const preset = target.dataset.underwaterPreset;
    if (preset !== "outside" && preset !== "surface" && preset !== "inside") return;
    setUnderwaterPreset(preset);
    for (const button of underwaterPresetButtons) {
      button.dataset.active = String(button.dataset.underwaterPreset === preset);
    }
  };
  for (const button of underwaterPresetButtons) button.addEventListener("click", handleUnderwaterPresetClick);

  const p1Controls = document.querySelector<HTMLElement>("[data-p1-controls]");
  const p1BodyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-p1-body-count]"));
  const p1DebugButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-p1-debug-view]"));
  const p1DynamicButton = document.querySelector<HTMLButtonElement>("[data-p1-dynamic-effects]");
  const poolHeading = document.querySelector<HTMLElement>("#interactive-pool-hud .hud-heading strong");
  const fixtureMark = document.getElementById("fixture-mark");
  p1Controls?.removeAttribute("hidden");
  if (p1Config.enabled) {
    if (poolHeading)
      poolHeading.textContent =
        p1Config.preset === "wake-foam"
          ? "尾迹与泡沫 / Wake · Temporal Foam"
          : p1Config.preset === "underwater"
            ? "水下介质 / Surface · Volume Continuity"
            : "泳池 Showcase / Reflection · Ripples · Buoyancy";
    if (fixtureMark)
      fixtureMark.textContent =
        p1Config.preset === "p1-diagnostics"
          ? "有界尾迹队列 · 时序泡沫 · 水下介质 · 同源 CPU Query"
          : "High Planar · 折射 · 4 物体 · 波纹 · 尾迹 · 同源水下介质";
  }

  const syncP1Controls = (): void => {
    for (const button of p1BodyButtons) {
      button.dataset.active = String(Number(button.dataset.p1BodyCount) === p1Metrics.bodyCount);
    }
    for (const button of p1DebugButtons) {
      button.dataset.active = String(button.dataset.p1DebugView === p1Metrics.debugView);
    }
    if (p1DynamicButton) {
      p1DynamicButton.dataset.active = String(dynamicEffectsEnabled);
      p1DynamicButton.textContent = dynamicEffectsEnabled ? "动态效果：开" : "动态效果：关";
    }
  };
  const setP1BodyCount = (count: PoolP1BodyCount): void => {
    if (!POOL_P1_BODY_COUNTS.includes(count)) throw new Error(`Unsupported P1 pool body count: ${count}.`);
    bodyFleet.setAdditionalBodyCount(count - 1);
    bodyFleet.restartDrives();
    interactionQueue.reset();
    temporalFoamTextures?.clear();
    p1Metrics.bodyCount = count;
    p1Metrics.bodyCountSelection = "manual";
    syncP1Controls();
  };
  const setP1DebugView = (view: PoolLocalEffectsDebugView): void => {
    if (view !== "source" && view !== "history" && view !== "final") {
      throw new Error(`Unsupported P1 local-effects debug view: ${view}.`);
    }
    p1Metrics.debugView = view;
    temporalFoamTextures?.setDebugView(view);
    surfaceController.setTemporalFoamTexture(
      temporalFoamTextures?.texture ?? null,
      dynamicEffectsEnabled && Boolean(temporalFoamTextures?.metrics.enabled),
      view
    );
    syncP1Controls();
  };
  const setP1DynamicEffectsEnabled = (enabled: boolean): void => {
    dynamicEffectsEnabled = enabled && p1Config.enabled;
    p1Metrics.dynamicEffectsEnabled = dynamicEffectsEnabled;
    interactionQueue.clearEvents();
    if (!dynamicEffectsEnabled) temporalFoamTextures?.clear();
    surfaceController.setTemporalFoamTexture(
      temporalFoamTextures?.texture ?? null,
      dynamicEffectsEnabled && Boolean(temporalFoamTextures?.metrics.enabled),
      p1Metrics.debugView
    );
    syncP1Controls();
  };
  const handleP1BodyCountClick = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement)) return;
    const count = Number(target.dataset.p1BodyCount);
    if (!POOL_P1_BODY_COUNTS.some((candidate) => candidate === count)) return;
    setP1BodyCount(count as PoolP1BodyCount);
  };
  const handleP1DebugViewClick = (event: Event): void => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement)) return;
    const view = target.dataset.p1DebugView;
    if (view !== "source" && view !== "history" && view !== "final") return;
    setP1DebugView(view);
  };
  const handleP1DynamicClick = (): void => setP1DynamicEffectsEnabled(!dynamicEffectsEnabled);
  for (const button of p1BodyButtons) button.addEventListener("click", handleP1BodyCountClick);
  for (const button of p1DebugButtons) button.addEventListener("click", handleP1DebugViewClick);
  p1DynamicButton?.addEventListener("click", handleP1DynamicClick);
  p1Metrics.additionalBodyCount = bodyFleet.metrics.bodyCount;
  syncP1Controls();
  window.waterPcgP1 = {
    get metrics() {
      return Object.freeze({ ...p1Metrics });
    },
    setBodyCount: setP1BodyCount,
    setDebugView: setP1DebugView,
    setDynamicEffectsEnabled: setP1DynamicEffectsEnabled,
    restartWakes(): void {
      bodyFleet.restartDrives();
    }
  };

  let entryInteractionBaseline = heightField.entryInteractionCount;
  let continuousInteractionBaseline = heightField.continuousInteractionCount;
  let contactInteractionBaseline = heightField.contactInteractionCount;
  let hudElapsed = 0;
  const resetObservationState = (): void => {
    entryInteractionBaseline = heightField.entryInteractionCount;
    continuousInteractionBaseline = heightField.continuousInteractionCount;
    contactInteractionBaseline = heightField.contactInteractionCount;
    metrics.ballSpawned = false;
    metrics.ballHeight = 0;
    metrics.ballVerticalSpeed = 0;
    metrics.ballInWater = false;
    metrics.initialBallHeightAboveSurface = 0;
    metrics.freeFallObserved = false;
    metrics.upwardBounceObserved = false;
    metrics.settled = false;
    metrics.entryImpactCount = 0;
    metrics.continuousInteractionCount = 0;
    metrics.contactInteractionCount = 0;
    metrics.firstImpactTime = 0;
    metrics.maximumAbsSurfaceHeight = 0;
    metrics.currentContactDepression = 0;
    metrics.maximumContactDepression = 0;
    metrics.currentContactRimHeight = 0;
    metrics.maximumContactRimHeight = 0;
    metrics.rippleRadius = 0;
    metrics.reflectedWaveObserved = false;
    metrics.rippleHighlightPeak = 0;
    metrics.maximumHighlightedVertexCount = 0;
  };
  const reset = (): void => {
    heightField.reset();
    interactionQueue.reset();
    temporalFoamTextures?.clear();
    bodyFleet.restartDrives();
    resetObservationState();
    ballSpawner.scheduleSpawn();
    autoTourActive = autoTourRequested;
    showcaseCameraController?.setFreeControlActive(showcaseCameraMode === "free");
    setStatus("releasing ball", "loading");
  };
  const setFocusedFeatureEnabled = (enabled: boolean): void => {
    if (p1Config.preset === "underwater") {
      setUnderwaterPreset(enabled ? "inside" : "outside");
      return;
    }
    interactionFeatureEnabled = enabled;
    if (p1Config.preset === "wake-foam") {
      setP1DynamicEffectsEnabled(enabled);
      if (enabled) bodyFleet.restartDrives();
    }
    reset();
  };
  window.waterPcgPoolFeature = {
    preset: p1Config.preset,
    get featureEnabled() {
      if (p1Config.preset === "underwater") return underwaterController.isUnderwater;
      if (p1Config.preset === "wake-foam") return dynamicEffectsEnabled && interactionFeatureEnabled;
      return interactionFeatureEnabled;
    },
    setFeatureEnabled: setFocusedFeatureEnabled,
    reset(): void {
      interactionFeatureEnabled = true;
      setP1DynamicEffectsEnabled(p1Config.enabled);
      setUnderwaterPreset(p1Config.initialUnderwaterPreset);
      reset();
    }
  };
  if (document.documentElement.dataset.waterPcgGroup === "feature") {
    const featureApi: WaterFeatureCaseApi = {
      caseId: document.documentElement.dataset.waterPcgCase ?? "",
      preset: p1Config.preset,
      get ready() {
        return metrics.ready;
      },
      get enabled() {
        return window.waterPcgPoolFeature?.featureEnabled ?? false;
      },
      setEnabled: setFocusedFeatureEnabled,
      reset: () => window.waterPcgPoolFeature?.reset(),
      snapshot() {
        const signal = featureApi.enabled
          ? p1Config.preset === "underwater"
            ? underwaterController.metrics.submergedDepth
            : p1Config.preset === "wake-foam"
              ? p1Metrics.foamHistoryEnergy
              : Math.max(metrics.maximumAbsSurfaceHeight, metrics.rippleRadius)
          : 0;
        return createFeatureSnapshot(featureApi, metrics.runtimeError, metrics.finite, signal);
      }
    };
    window.waterPcgFeature = featureApi;
  }
  window.waterPcgResetInteractivePool = reset;
  window.waterPcgSetInteractivePoolTargetFrameRate = (framesPerSecond: number): void => {
    if (!Number.isFinite(framesPerSecond) || framesPerSecond < 1 || framesPerSecond > 240) {
      throw new Error("Interactive pool target frame rate must be within [1, 240].");
    }
    engine.vSyncCount = 0;
    engine.targetFrameRate = framesPerSecond;
    metrics.targetFrameRate = framesPerSecond;
  };
  resetButton.addEventListener("click", reset);

  const metricsScript = root.addComponent(PoolMetricsUpdateScript);
  metricsScript.callback = (deltaTime: number): void => {
    metrics.renderFrameCount++;
    showcaseFrameSampler.record(deltaTime);
    if (autoTourActive) {
      const lengthDirectionX = axisX / axisLength;
      const lengthDirectionZ = axisZ / axisLength;
      const lateralX = -lengthDirectionZ;
      const lateralZ = lengthDirectionX;
      const phase = engine.time.elapsedTime * 0.09;
      const along = Math.sin(phase) * layout.length * 0.12;
      const lateral = layout.width * (0.72 + Math.cos(phase * 0.7) * 0.08);
      const cameraX = layout.position[0] - lengthDirectionX * (layout.length * 0.3 - along) + lateralX * lateral;
      const cameraZ = layout.position[2] - lengthDirectionZ * (layout.length * 0.3 - along) + lateralZ * lateral;
      cameraEntity.transform.setPosition(cameraX, layout.position[1] + 9.5, cameraZ);
      orbit.target.set(
        layout.position[0] + lengthDirectionX * along * 0.28,
        layout.position[1] - 0.25,
        layout.position[2] + lengthDirectionZ * along * 0.28
      );
      cameraEntity.transform.lookAt(orbit.target);
    }
    reflectionService.update(metrics.renderFrameCount);
    const currentSurfaceOpticsReadback = applySurfaceOpticsBinding();
    if (currentSurfaceOpticsReadback) {
      p1Metrics.surfaceOpticsRequestedTier = currentSurfaceOpticsReadback.requestedTier;
      p1Metrics.surfaceOpticsResolvedTier = currentSurfaceOpticsReadback.resolvedTier;
      p1Metrics.surfaceReflectionSource = currentSurfaceOpticsReadback.effectiveSource;
      p1Metrics.surfaceRefractionEnabled = currentSurfaceOpticsReadback.refractionEnabled;
    }
    underwaterController.update();
    const interactionTime = engine.time.elapsedTime;
    for (const sink of interactionSinks.values()) sink.timeSeconds = interactionTime;
    p1Metrics.queuedEventCount = interactionQueue.count;
    interactionQueue.drain(foamConsumer);
    const foamSurfaceQueryCountBefore = provider.sampleCount;
    temporalFoamTextures?.updateFrame(metrics.renderFrameCount, deltaTime, temporalFoamCurrentSnapshot);
    p1Metrics.foamFullSurfaceQueryCount += provider.sampleCount - foamSurfaceQueryCountBefore;
    surfaceController.setTemporalFoamTexture(
      temporalFoamTextures?.texture ?? null,
      dynamicEffectsEnabled && Boolean(temporalFoamTextures?.metrics.enabled),
      p1Metrics.debugView
    );
    const fleetMetrics = bodyFleet.metrics;
    const queueMetrics = interactionQueue.metrics;
    const foamMetrics = temporalFoamField?.metrics;
    const foamTextureMetrics = temporalFoamTextures?.metrics;
    p1Metrics.additionalBodyCount = fleetMetrics.bodyCount;
    p1Metrics.drivingBodyCount = fleetMetrics.drivingBodyCount;
    p1Metrics.submergedBodyCount = fleetMetrics.submergedBodyCount;
    p1Metrics.maximumHorizontalSpeed = fleetMetrics.maximumHorizontalSpeed;
    p1Metrics.acceptedEventCount = queueMetrics.acceptedCount;
    p1Metrics.droppedEventCount = queueMetrics.droppedCount;
    p1Metrics.aggregatedEventCount = queueMetrics.aggregatedCount;
    p1Metrics.stationaryRejectedEventCount = queueMetrics.stationaryRejectedCount;
    p1Metrics.peakQueuedEventCount = queueMetrics.peakCount;
    p1Metrics.foamSourceInjectionCount = foamMetrics?.sourceInjectionCount ?? 0;
    p1Metrics.foamActiveHistoryPixelCount = foamMetrics?.activeHistoryPixelCount ?? 0;
    p1Metrics.foamPeakHistoryValue = foamMetrics?.peakHistoryValue ?? 0;
    p1Metrics.foamHistoryEnergy = foamMetrics?.historyEnergy ?? 0;
    p1Metrics.foamActiveLifetimeSeconds = foamMetrics?.activeLifetimeSeconds ?? 0;
    p1Metrics.foamMaximumLifetimeSeconds = foamMetrics?.maximumLifetimeSeconds ?? 0;
    p1Metrics.foamCentroidDriftDistance = foamMetrics?.centroidDriftDistance ?? 0;
    p1Metrics.foamUpdateCount = foamMetrics?.updateCount ?? 0;
    p1Metrics.foamIdleSkipCount = foamMetrics?.idleSkipCount ?? 0;
    p1Metrics.foamTextureUploadsPerRenderFrame = foamTextureMetrics?.lastFrameUploadCount ?? 0;
    p1Metrics.foamTextureUploadCount = foamTextureMetrics?.uploadCount ?? 0;
    p1Metrics.foamResourceBytes = foamTextureMetrics?.resourceBytes ?? 0;
    p1Metrics.foamCurrentSnapshotKind = temporalFoamCurrentSnapshot?.kind ?? "none";
    p1Metrics.foamCurrentSnapshotRevision = temporalFoamCurrentSnapshot?.revision ?? -1;
    p1Metrics.foamCurrentLookupCount = foamMetrics?.currentLookupCount ?? 0;
    p1Metrics.foamTargetUpdateRateHz = foamTextureMetrics?.targetUpdateRateHz ?? 0;
    p1Metrics.foamRateLimitedFrameCount = foamTextureMetrics?.rateLimitedFrameCount ?? 0;
    p1Metrics.foamLastStepDeltaSeconds = foamTextureMetrics?.lastStepDeltaSeconds ?? 0;
    const ballEntity = ballSpawner.ballEntity;
    const collider = ballSpawner.collider;
    const buoyancy = ballSpawner.buoyancy;
    const trackedPosition = ballEntity?.transform.worldPosition;
    centerQueryPosition.set(trackedPosition?.x ?? layout.position[0], 0, trackedPosition?.z ?? layout.position[2]);
    if (provider.sampleSurface(centerQueryPosition, centerSurfaceSample)) {
      metrics.centerSurfaceHeight = centerSurfaceSample.surfacePosition.y;
      metrics.centerSurfaceVerticalSpeed = centerSurfaceSample.waterVelocity.y;
    }
    metrics.ballSpawned = Boolean(ballEntity && collider && buoyancy);
    if (ballEntity && collider && buoyancy) {
      const velocity = collider.linearVelocity;
      metrics.ballHeight = ballEntity.transform.worldPosition.y;
      metrics.ballVerticalSpeed = velocity.y;
      metrics.ballInWater = buoyancy.isInWater;
      metrics.initialBallHeightAboveSurface = ballSpawner.initialHeightAboveSurface;
      if (!metrics.ballInWater && velocity.y < -0.1) metrics.freeFallObserved = true;
      if (metrics.entryImpactCount > 0 && velocity.y > 0.1) metrics.upwardBounceObserved = true;
      const impactAge = metrics.firstImpactTime > 0 ? engine.time.elapsedTime - metrics.firstImpactTime : 0;
      metrics.settled =
        impactAge > 4 &&
        buoyancy.isInWater &&
        Math.abs(velocity.y) < 0.15 &&
        Math.abs(metrics.ballHeight - metrics.centerSurfaceHeight) < 0.35;
      metrics.finite =
        Number.isFinite(metrics.ballHeight) &&
        Number.isFinite(velocity.x) &&
        Number.isFinite(velocity.y) &&
        Number.isFinite(velocity.z) &&
        heightField.heightCurrent.every(Number.isFinite) &&
        heightField.verticalVelocity.every(Number.isFinite);
    } else {
      metrics.ballInWater = false;
      metrics.finite =
        heightField.heightCurrent.every(Number.isFinite) && heightField.verticalVelocity.every(Number.isFinite);
    }

    metrics.entryImpactCount = heightField.entryInteractionCount - entryInteractionBaseline;
    metrics.continuousInteractionCount = heightField.continuousInteractionCount - continuousInteractionBaseline;
    metrics.contactInteractionCount = heightField.contactInteractionCount - contactInteractionBaseline;
    if (metrics.entryImpactCount > 0 && metrics.firstImpactTime === 0)
      metrics.firstImpactTime = engine.time.elapsedTime;
    metrics.maximumAbsSurfaceHeight = heightField.maximumAbsHeight;
    metrics.currentContactDepression = heightField.currentContactDepression;
    metrics.maximumContactDepression = heightField.maximumContactDepression;
    metrics.currentContactRimHeight = heightField.currentContactRimHeight;
    metrics.maximumContactRimHeight = heightField.maximumContactRimHeight;
    metrics.rippleRadius = heightField.measureActiveRadius(
      heightField.lastInteractionLocalX,
      heightField.lastInteractionLocalZ
    );
    metrics.reflectedWaveObserved = heightField.maximumBoundaryAbsHeight >= 0.0005;
    metrics.rippleHighlightPeak = Math.max(metrics.rippleHighlightPeak, surfaceController.rippleHighlightPeak);
    metrics.maximumHighlightedVertexCount = Math.max(
      metrics.maximumHighlightedVertexCount,
      surfaceController.highlightedVertexCount
    );
    metrics.surfaceVertexCount = surfaceController.surfaceVertexCount;
    metrics.meshUploadsPerRenderFrame = surfaceController.maximumUploadsPerRenderFrame;
    metrics.totalMeshUploads = surfaceController.totalMeshUploads;
    metrics.physicsFixedTimeStep = scene.physics.fixedTimeStep;
    if (!surfaceController.lastPhysicsStepSucceeded || heightField.diagnostic !== "none") {
      metrics.runtimeError = `height-field-${heightField.diagnostic}`;
    }
    if (!metrics.finite && !metrics.runtimeError) metrics.runtimeError = "non-finite-interactive-pool-state";

    hudElapsed += deltaTime;
    if (hudElapsed < 0.08) return;
    hudElapsed = 0;
    writeMetric("ball", metrics.ballSpawned ? `${metrics.ballHeight.toFixed(2)} m` : "waiting");
    writeMetric("velocity", metrics.ballSpawned ? `${metrics.ballVerticalSpeed.toFixed(2)} m/s` : "—");
    writeMetric(
      "interactions",
      `${metrics.entryImpactCount} / ${metrics.continuousInteractionCount} / ${metrics.contactInteractionCount}`
    );
    writeMetric("height", `${metrics.maximumAbsSurfaceHeight.toFixed(3)} m`);
    writeMetric(
      "contact",
      `${metrics.currentContactDepression.toFixed(3)} / ${metrics.currentContactRimHeight.toFixed(3)} m`
    );
    writeMetric("radius", `${metrics.rippleRadius.toFixed(1)} m`);
    writeMetric("visibility", `${metrics.rippleHighlightPeak.toFixed(2)} / ${metrics.maximumHighlightedVertexCount}`);
    writeMetric("vertices", String(metrics.surfaceVertexCount));
    writeMetric("uploads", String(metrics.meshUploadsPerRenderFrame));
    writeMetric("error", metrics.runtimeError || "none");
    writeMetric("p1-bodies", `${p1Metrics.bodyCount} / ${p1Metrics.drivingBodyCount} moving`);
    writeMetric(
      "p1-events",
      `${p1Metrics.acceptedEventCount} / ${p1Metrics.aggregatedEventCount} / ${p1Metrics.droppedEventCount}`
    );
    writeMetric(
      "p1-foam",
      p1Metrics.temporalFoamEnabled
        ? `${p1Metrics.foamActiveHistoryPixelCount} px / ${p1Metrics.foamPeakHistoryValue.toFixed(2)}`
        : "analytic fallback"
    );
    writeMetric(
      "p1-budget",
      `${p1Metrics.foamTextureUploadsPerRenderFrame} tex / ${(p1Metrics.foamResourceBytes / 1024).toFixed(0)} KiB`
    );
    writeMetric(
      "p1-foam-motion",
      `${p1Metrics.foamActiveLifetimeSeconds.toFixed(1)} s / ${p1Metrics.foamCentroidDriftDistance.toFixed(2)} m`
    );
    writeMetric("p1-upload", `${p1Metrics.surfaceUploadStrategy} / ${p1Metrics.surfaceUploadPolicySelection}`);
    const underwaterMetrics = underwaterController.metrics;
    writeMetric(
      "underwater",
      underwaterController.isUnderwater
        ? `${underwaterMetrics.activeBodyId} / ${underwaterMetrics.submergedDepth.toFixed(2)} m`
        : "outside"
    );
    metricsElement.dataset.underwater = String(underwaterController.isUnderwater);
    metricsElement.dataset.underwaterBodyId = underwaterMetrics.activeBodyId;
    metricsElement.dataset.underwaterSignedDistance = underwaterMetrics.signedSurfaceDistance.toFixed(4);
    metricsElement.dataset.underwaterPassExecutions = String(underwaterMetrics.postProcessExecutionCount);
    metricsElement.dataset.underwaterMaterialAllocated = String(underwaterPass.metrics.materialAllocated);
    metricsElement.dataset.underwaterMaterialCreateCount = String(underwaterPass.metrics.materialCreateCount);
    metricsElement.dataset.underwaterMaterialDestroyCount = String(underwaterPass.metrics.materialDestroyCount);
    metricsElement.dataset.underwaterRenderTargetBytes = String(
      cameraFeatureBroker.metrics.underwaterRequested ? cameraFeatureBroker.metrics.estimatedRenderTargetBytes : 0
    );
    metricsElement.dataset.p1Enabled = String(p1Metrics.enabled);
    metricsElement.dataset.p1BodyCount = String(p1Metrics.bodyCount);
    metricsElement.dataset.p1BodyCountSelection = p1Metrics.bodyCountSelection;
    metricsElement.dataset.p1DrivingBodyCount = String(p1Metrics.drivingBodyCount);
    metricsElement.dataset.p1DynamicEffectsEnabled = String(p1Metrics.dynamicEffectsEnabled);
    metricsElement.dataset.p1ModifierCount = String(p1Metrics.modifierCount);
    metricsElement.dataset.p1QueueCapacity = String(p1Metrics.queueCapacity);
    metricsElement.dataset.p1QueuedEventCount = String(p1Metrics.queuedEventCount);
    metricsElement.dataset.p1AcceptedEventCount = String(p1Metrics.acceptedEventCount);
    metricsElement.dataset.p1DroppedEventCount = String(p1Metrics.droppedEventCount);
    metricsElement.dataset.p1AggregatedEventCount = String(p1Metrics.aggregatedEventCount);
    metricsElement.dataset.p1StationaryRejectedEventCount = String(p1Metrics.stationaryRejectedEventCount);
    metricsElement.dataset.p1DebugView = p1Metrics.debugView;
    metricsElement.dataset.p1TemporalFoamEnabled = String(p1Metrics.temporalFoamEnabled);
    metricsElement.dataset.p1FoamActivePixels = String(p1Metrics.foamActiveHistoryPixelCount);
    metricsElement.dataset.p1FoamPeak = p1Metrics.foamPeakHistoryValue.toFixed(4);
    metricsElement.dataset.p1FoamEnergy = p1Metrics.foamHistoryEnergy.toFixed(4);
    metricsElement.dataset.p1FoamActiveLifetime = p1Metrics.foamActiveLifetimeSeconds.toFixed(3);
    metricsElement.dataset.p1FoamMaximumLifetime = p1Metrics.foamMaximumLifetimeSeconds.toFixed(3);
    metricsElement.dataset.p1FoamCentroidDrift = p1Metrics.foamCentroidDriftDistance.toFixed(4);
    metricsElement.dataset.p1FoamUpdateCount = String(p1Metrics.foamUpdateCount);
    metricsElement.dataset.p1FoamTextureUploadCount = String(p1Metrics.foamTextureUploadCount);
    metricsElement.dataset.p1FoamUploadsPerFrame = String(p1Metrics.foamTextureUploadsPerRenderFrame);
    metricsElement.dataset.p1FoamResourceBytes = String(p1Metrics.foamResourceBytes);
    metricsElement.dataset.p1FoamCurrentSnapshotKind = p1Metrics.foamCurrentSnapshotKind;
    metricsElement.dataset.p1FoamCurrentSnapshotRevision = String(p1Metrics.foamCurrentSnapshotRevision);
    metricsElement.dataset.p1FoamCurrentSnapshotBuildCount = String(p1Metrics.foamCurrentSnapshotBuildCount);
    metricsElement.dataset.p1FoamCurrentLookupCount = String(p1Metrics.foamCurrentLookupCount);
    metricsElement.dataset.p1FoamFullSurfaceQueryCount = String(p1Metrics.foamFullSurfaceQueryCount);
    metricsElement.dataset.p1FoamTargetUpdateRateHz = String(p1Metrics.foamTargetUpdateRateHz);
    metricsElement.dataset.p1FoamRateLimitedFrameCount = String(p1Metrics.foamRateLimitedFrameCount);
    metricsElement.dataset.p1FoamLastStepDeltaSeconds = p1Metrics.foamLastStepDeltaSeconds.toFixed(4);
    metricsElement.dataset.p1SurfaceUploadStrategy = p1Metrics.surfaceUploadStrategy;
    metricsElement.dataset.p1SurfaceUploadBytes = String(p1Metrics.estimatedSurfaceUploadBytesPerFrame);
    metricsElement.dataset.p1QuerySource = p1Metrics.querySource;
    metricsElement.dataset.p1GpuReadback = String(p1Metrics.requiresGpuReadback);
    metricsElement.dataset.p1SurfaceOpticsRequestedTier = p1Metrics.surfaceOpticsRequestedTier;
    metricsElement.dataset.p1SurfaceOpticsResolvedTier = p1Metrics.surfaceOpticsResolvedTier;
    metricsElement.dataset.p1SurfaceReflectionSource = p1Metrics.surfaceReflectionSource;
    metricsElement.dataset.p1SurfaceRefractionEnabled = String(p1Metrics.surfaceRefractionEnabled);
    metricsElement.dataset.p1SharedUnderwaterOpticalProfile = String(p1Metrics.sharesUnderwaterOpticalProfile);
    const reflectionMetrics = reflectionService.metrics;
    metricsElement.dataset.planarCameraCount = String(reflectionMetrics.planarCameraCount);
    metricsElement.dataset.planarRenderTargetCount = String(reflectionMetrics.liveRenderTargetCount ?? 0);
    metricsElement.dataset.planarUpdateCount = String(reflectionMetrics.planarUpdateCount);
    metricsElement.dataset.planarRenderTargetBytes = String(reflectionMetrics.estimatedRenderTargetBytes);
    metricsElement.dataset.planarWaterLayerExcluded = String(reflectionMetrics.waterLayerExcludedFromPlanar);
    metricsElement.dataset.planarFilterSampleCount = String(
      currentSurfaceOpticsReadback?.filterSampleCount ?? surfaceOpticsReadback.filterSampleCount
    );
    if (metrics.runtimeError) setStatus("runtime failed", "error");
    else if (metrics.settled) setStatus("stable floating", "ready");
    else if (metrics.entryImpactCount > 0) setStatus("two-way wave coupling", "ready");
    else if (metrics.ballSpawned) setStatus("free fall", "ready");
  };

  metrics.surfaceVertexCount = surfaceController.surfaceVertexCount;
  metrics.totalMeshUploads = surfaceController.totalMeshUploads;
  metrics.physicsFixedTimeStep = scene.physics.fixedTimeStep;
  metrics.targetFrameRate = engine.targetFrameRate;
  metrics.ready = true;
  if (p1Config.preset === "hero-pool" && quality === "high") {
    const captureStates = Object.freeze({
      hero: Object.freeze({
        underwaterPreset: "outside" as const,
        position: indoorReflectivePoolExample.view.cameraPosition,
        target: indoorReflectivePoolExample.view.cameraTarget
      }),
      interaction: Object.freeze({
        underwaterPreset: "outside" as const,
        position: [14, 2.8, 12] as const,
        target: [0, 0.15, 0] as const
      }),
      detail: Object.freeze({
        underwaterPreset: "inside" as const,
        position: [-14, -1.05, 8] as const,
        target: [4, -0.85, 0] as const
      })
    } as const);
    let currentCaptureState: keyof typeof captureStates = "hero";
    window.waterPcgShowcase = {
      states: Object.freeze(Object.keys(captureStates)),
      get currentState() {
        return currentCaptureState;
      },
      setCaptureState(state: string): void {
        if (!(state in captureStates)) throw new Error(`Unknown Pool capture state: ${state}.`);
        const captureState = state as keyof typeof captureStates;
        const capture = captureStates[captureState];
        engine.resume();
        reset();
        autoTourActive = false;
        showcaseCameraController?.setFreeControlActive(false);
        currentCaptureState = captureState;
        setUnderwaterPreset(capture.underwaterPreset);
        cameraEntity.transform.setPosition(capture.position[0], capture.position[1], capture.position[2]);
        orbit.target.set(capture.target[0], capture.target[1], capture.target[2]);
        cameraEntity.transform.lookAt(orbit.target);
        showcaseCameraController?.syncFromTransform();
        if (captureState === "interaction") {
          const impactPosition = new Vector3(layout.position[0] - 8, layout.position[1], layout.position[2] - 2);
          heightField.registerInteraction(impactPosition, new Vector3(0, 1, 0), new Vector3(0, -8, 0), 1.3, 0.5, true);
          for (let step = 0; step < 42; step++) heightField.step(scene.physics.fixedTimeStep);
        }
        underwaterController.update();
        if (search.get("visual") === "1") {
          engine.pause();
          engine.update();
        }
      },
      reset(): void {
        engine.resume();
        currentCaptureState = "hero";
        reset();
        setUnderwaterPreset("outside");
      }
    };
    Object.defineProperty(window, "waterPcgAcceptance", {
      configurable: true,
      enumerable: true,
      get: () => {
        const reflectionMetrics = reflectionService.metrics;
        const frame = showcaseFrameSampler.metrics;
        return Object.freeze({
          ready: metrics.ready,
          caseId: "showcase-pool",
          runtime: "pool" as const,
          preset: p1Config.preset,
          runtimeError: metrics.runtimeError || null,
          finite: metrics.finite && frame.finite,
          qualityTier: "high" as const,
          opticsTier: "high" as const,
          frame,
          resources: Object.freeze({
            bufferMemory: 0,
            textureMemory: p1Metrics.foamResourceBytes + reflectionMetrics.estimatedRenderTargetBytes,
            totalMemory: p1Metrics.foamResourceBytes + reflectionMetrics.estimatedRenderTargetBytes,
            liveRenderTargets: reflectionMetrics.liveRenderTargetCount ?? 0,
            liveReflectionCameras: reflectionMetrics.planarCameraCount,
            meshUploadCount: metrics.totalMeshUploads,
            perFrameMeshUpload: metrics.meshUploadsPerRenderFrame > 0
          }),
          reflection: Object.freeze({
            requestedSource: "planar" as const,
            effectiveSource: p1Metrics.surfaceReflectionSource,
            ownerCount: reflectionMetrics.eligiblePlanarRequestCount ?? 0,
            cameraCount: reflectionMetrics.planarCameraCount,
            renderTargetCount: reflectionMetrics.liveRenderTargetCount ?? 0,
            filterSampleCount: surfaceController.surfaceOpticsReadback?.filterSampleCount ?? 1,
            failureCount: reflectionMetrics.planarFailureCount
          }),
          refractionEnabled: p1Metrics.surfaceRefractionEnabled,
          scene: Object.freeze({
            bodyCount: p1Metrics.bodyCount,
            rippleRadius: metrics.rippleRadius,
            foamActivePixels: p1Metrics.foamActiveHistoryPixelCount,
            underwater: underwaterController.isUnderwater,
            planarWaterLayerExcluded: reflectionMetrics.waterLayerExcludedFromPlanar,
            cameraMode: showcaseCameraMode ?? "feature"
          })
        });
      }
    });
  }
  setStatus("releasing ball", "ready");
  engine.run();

  const cleanup = (): void => {
    window.removeEventListener("resize", resizeCanvas);
    window.removeEventListener("resize", syncCameraFeatureViewport);
    window.removeEventListener("resize", syncReflectionViewport);
    window.removeEventListener("keydown", handleCameraKeyDown);
    poolCanvas?.removeEventListener("pointerdown", pauseAutoTour);
    poolCanvas?.removeEventListener("wheel", pauseAutoTour);
    resetButton.removeEventListener("click", reset);
    for (const button of underwaterPresetButtons) button.removeEventListener("click", handleUnderwaterPresetClick);
    for (const button of p1BodyButtons) button.removeEventListener("click", handleP1BodyCountClick);
    for (const button of p1DebugButtons) button.removeEventListener("click", handleP1DebugViewClick);
    p1DynamicButton?.removeEventListener("click", handleP1DynamicClick);
    metricsScript.callback = null;
    underwaterController.destroy();
    underwaterPass.destroy();
    ballSpawner.dispose();
    bodyFleet.dispose();
    surfaceController.dispose();
    temporalFoamTextures?.destroy();
    interactionQueue.clearEvents();
    poolPhysics.destroy();
    poolScene.destroy();
    riverBed.destroy();
    riverRuntime.destroy();
    riverResource.dispose();
    compileWorker.dispose();
    cameraFeatures.destroy();
    cameraFeatureBroker.removeRequest("pool-showcase-reflection");
    reflectionService.removeRequest(reflectionConsumerId);
    reflectionServiceLease.release();
    cameraFeatureBroker.destroy();
    waterWorld.destroy();
    window.waterPcgP0 = undefined;
    showcaseCameraController?.destroy();
    root.destroy();
    delete window.waterPcgResetInteractivePool;
    delete window.waterPcgSetInteractivePoolTargetFrameRate;
    delete window.waterPcgUnderwater;
    delete window.waterPcgP1;
    delete window.waterPcgPoolFeature;
    delete window.waterPcgFeature;
    delete window.waterPcgShowcase;
    delete window.waterPcgAcceptance;
  };
  window.addEventListener("beforeunload", cleanup, { once: true });
}

setStatus("initializing PhysX", "loading");
bootstrapInteractivePool().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  metrics.runtimeError = message;
  metrics.ready = false;
  metrics.finite = false;
  writeMetric("error", message);
  setStatus("initialization failed", "error");
  console.error(error);
});
