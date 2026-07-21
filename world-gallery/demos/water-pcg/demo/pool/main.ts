/** Standalone Galacean + PhysX runtime for the interactive indoor pool. */
import { Camera, Color, Script, Vector3, WebGLEngine, WebGLMode } from "@galacean/engine";
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
import { PoolPhysicsSceneController } from "./PoolPhysicsSceneController";
import type { InteractivePoolGridQuality, InteractivePoolMetrics } from "./types";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

const search = new URLSearchParams(window.location.search);
const quality: InteractivePoolGridQuality =
  search.get("quality") === "low" || search.get("webgl") === "1" ? "low" : "medium";
const resolutionX = quality === "low" ? 65 : 129;
const resolutionZ = quality === "low" ? 27 : 53;
const centerQueryPosition = new Vector3();
const centerSurfaceSample = createWaterSurfaceSample();

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
      webGLMode: search.get("webgl") === "1" ? WebGLMode.WebGL1 : WebGLMode.Auto
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
  const cameraFeatures = new RiverCameraFeatureController(camera);
  cameraFeatures.apply(true, reach.config.quality.material.level);

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

  const surfaceDriverEntity = root.createChild("interactive-pool-surface-driver");
  const surfaceController = surfaceDriverEntity.addComponent(InteractivePoolSurfaceController);
  surfaceController.configure({ engine, parent: root, compiledData: data, heightField });
  const ballSpawnerEntity = root.createChild("interactive-pool-ball-spawner");
  const ballSpawner = ballSpawnerEntity.addComponent(PoolBallSpawner);
  ballSpawner.configure({
    engine,
    surfaceProvider: provider,
    interactionSink: heightField,
    spawnCenterX: layout.position[0],
    spawnCenterZ: layout.position[2]
  });

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
    resetObservationState();
    ballSpawner.scheduleSpawn();
    setStatus("releasing ball", "loading");
  };
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
  setStatus("releasing ball", "ready");
  engine.run();

  const cleanup = (): void => {
    window.removeEventListener("resize", resizeCanvas);
    resetButton.removeEventListener("click", reset);
    metricsScript.callback = null;
    ballSpawner.dispose();
    surfaceController.dispose();
    poolPhysics.destroy();
    poolScene.destroy();
    riverBed.destroy();
    riverRuntime.destroy();
    riverResource.dispose();
    compileWorker.dispose();
    cameraFeatures.destroy();
    root.destroy();
    delete window.waterPcgResetInteractivePool;
    delete window.waterPcgSetInteractivePoolTargetFrameRate;
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
