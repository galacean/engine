/** Standalone raster-defined curved-water visual preview. No Terrain dependency. */
import { Camera, Color, DirectLight, Downsampling, WebGLMode, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { HeightfieldWaterCompiledData } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import { HeightfieldWaterCompileWorkerClient } from "../../runtime/heightfield/HeightfieldWaterCompileWorkerClient";
import type { HeightfieldWaterResource } from "../../runtime/heightfield/HeightfieldWaterResource";
import { HeightfieldWaterRuntimeController } from "../../runtime/heightfield/HeightfieldWaterRuntimeController";
import type { HeightfieldWaterRuntimeActivation } from "../../runtime/heightfield/HeightfieldWaterRuntimeController";
import { HeightfieldWaterDebugMode } from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import { CameraWaterFeatureBroker } from "../../runtime/optics/CameraWaterFeatureBroker";
import { getWaterBodyCapabilities } from "../../runtime/body/WaterBodyCapabilities";
import { WaterBodyRuntimeAdapter } from "../../runtime/body/WaterBodyRuntime";
import { WaterP0DebugController } from "../../runtime/body/WaterP0DebugApi";
import { WaterWorld } from "../../runtime/body/WaterWorld";
import { HeightfieldBedController } from "./HeightfieldBedController";
import { createHeightfieldWaterFixture, type HeightfieldWaterFixture } from "./heightfieldFixture";
import { createFeatureSnapshot, type WaterFeatureCaseApi } from "../showcase/WaterFeatureCaseApi";

const QUALITY_OPTIONS = {
  Low: WaterQualityTier.Low,
  Medium: WaterQualityTier.Medium,
  High: WaterQualityTier.High
} as const;

const DEBUG_OPTIONS = {
  Final: HeightfieldWaterDebugMode.Final,
  BaseHeight: HeightfieldWaterDebugMode.BaseHeight,
  BaseNormal: HeightfieldWaterDebugMode.BaseNormal,
  SDF: HeightfieldWaterDebugMode.SignedDistance,
  Depth: HeightfieldWaterDebugMode.Depth,
  Flow: HeightfieldWaterDebugMode.Flow,
  WaveDisplacement: HeightfieldWaterDebugMode.WaveDisplacement
} as const;

type QualityLabel = keyof typeof QUALITY_OPTIONS;
type DebugLabel = keyof typeof DEBUG_OPTIONS;

interface HeightfieldGuiState {
  quality: QualityLabel;
  waves: boolean;
  microNormals: boolean;
  foam: boolean;
  animateTime: boolean;
  surfaceTime: number;
  debug: DebugLabel;
}

export interface HeightfieldWaterDemoMetrics {
  readonly ready: boolean;
  readonly sourceHash: string;
  readonly quality: WaterQualityTier;
  readonly componentCount: number;
  readonly chunkCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly atlasWidth: number;
  readonly atlasHeight: number;
  readonly activeWaveCount: number;
  readonly meshUploadCount: number;
  readonly perFrameMeshUpload: false;
  readonly runtimeError: string;
}

export interface HeightfieldWaterDemoApi {
  readonly metrics: HeightfieldWaterDemoMetrics;
  readonly featureEnabled: boolean;
  setQuality(quality: WaterQualityTier): Promise<void>;
  setDebugMode(mode: HeightfieldWaterDebugMode): void;
  setSurfaceTime(elapsedTime?: number): void;
  setFeatureEnabled(enabled: boolean): void;
  reset(): void;
}

declare global {
  interface Window {
    heightfieldWaterDemo?: HeightfieldWaterDemoApi;
  }
}

const statusCandidate = document.getElementById("heightfield-status");
const metricsCandidate = document.getElementById("heightfield-metrics");

if (!(statusCandidate instanceof HTMLSpanElement) || !(metricsCandidate instanceof HTMLDListElement)) {
  throw new Error("Heightfield water HUD is missing required elements.");
}
const statusElement: HTMLSpanElement = statusCandidate;
const metricsElement: HTMLDListElement = metricsCandidate;

function setStatus(message: string, state: "loading" | "ready" | "error"): void {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function writeMetric(name: string, value: string): void {
  const target = metricsElement.querySelector(`[data-metric="${name}"]`);
  if (target) target.textContent = value;
}

function qualityLabel(quality: WaterQualityTier): QualityLabel {
  return quality === WaterQualityTier.Low ? "Low" : quality === WaterQualityTier.High ? "High" : "Medium";
}

function parseQuality(value: string | null): WaterQualityTier {
  return Object.values(WaterQualityTier).find((quality) => quality === value) ?? WaterQualityTier.High;
}

function parseDebugLabel(value: string | null): DebugLabel {
  const entry = Object.keys(DEBUG_OPTIONS).find((label) => label.toLowerCase() === value?.toLowerCase());
  return (entry as DebugLabel | undefined) ?? "Final";
}

function createEmptyMetrics(quality: WaterQualityTier, runtimeError = ""): HeightfieldWaterDemoMetrics {
  return {
    ready: false,
    sourceHash: "",
    quality,
    componentCount: 0,
    chunkCount: 0,
    vertexCount: 0,
    triangleCount: 0,
    atlasWidth: 0,
    atlasHeight: 0,
    activeWaveCount: 0,
    meshUploadCount: 0,
    perFrameMeshUpload: false,
    runtimeError
  };
}

function writeCompiledMetrics(
  data: HeightfieldWaterCompiledData,
  activation: HeightfieldWaterRuntimeActivation
): HeightfieldWaterDemoMetrics {
  const metrics: HeightfieldWaterDemoMetrics = {
    ready: true,
    sourceHash: data.sourceHash,
    quality: data.quality,
    componentCount: data.components.length,
    chunkCount: data.chunks.length,
    vertexCount: data.stats.vertexCount,
    triangleCount: data.stats.triangleCount,
    atlasWidth: data.localMapAtlas.width,
    atlasHeight: data.localMapAtlas.height,
    activeWaveCount: data.waveSet.activeWaveCount,
    meshUploadCount: activation.meshUploadCount,
    perFrameMeshUpload: false,
    runtimeError: ""
  };
  metricsElement.dataset.componentCount = String(metrics.componentCount);
  metricsElement.dataset.chunkCount = String(metrics.chunkCount);
  metricsElement.dataset.vertexCount = String(metrics.vertexCount);
  metricsElement.dataset.triangleCount = String(metrics.triangleCount);
  metricsElement.dataset.atlasSize = `${metrics.atlasWidth}x${metrics.atlasHeight}`;
  metricsElement.dataset.waveCount = String(metrics.activeWaveCount);
  metricsElement.dataset.meshUploadCount = String(metrics.meshUploadCount);
  metricsElement.dataset.perFrameMeshUpload = String(metrics.perFrameMeshUpload);
  metricsElement.dataset.runtimeError = "";
  metricsElement.dataset.sourceHash = metrics.sourceHash;
  metricsElement.dataset.quality = metrics.quality;
  writeMetric("components", String(metrics.componentCount));
  writeMetric("chunks", String(metrics.chunkCount));
  writeMetric("vertices", metrics.vertexCount.toLocaleString("en-US"));
  writeMetric("triangles", metrics.triangleCount.toLocaleString("en-US"));
  writeMetric("atlas", `${metrics.atlasWidth}×${metrics.atlasHeight}`);
  writeMetric("waves", String(metrics.activeWaveCount));
  writeMetric("uploads", String(metrics.meshUploadCount));
  writeMetric("quality", metrics.quality);
  return metrics;
}

async function bootstrapHeightfieldWater(): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  const routePreset = document.documentElement.dataset.waterPcgPreset;
  const shoreFoamPreset = routePreset === "shore-foam";
  const livePresentationEnabled = document.documentElement.dataset.waterPcgDeveloperTools === "true";
  const createRuntimeFixture = (quality: WaterQualityTier): HeightfieldWaterFixture => {
    const fixture = createHeightfieldWaterFixture(quality);
    if (!shoreFoamPreset) return fixture;
    return {
      ...fixture,
      descriptor: {
        ...fixture.descriptor,
        id: `${fixture.descriptor.id}-shore-foam`,
        material: {
          ...fixture.descriptor.material,
          shoreFoamWidth: 2.8
        }
      }
    };
  };
  const startupQuality = parseQuality(search.get("quality"));
  const startupDebug = parseDebugLabel(search.get("debug"));
  const requestedTime = Number(search.get("surfaceTime"));
  const hasTimeOverride = search.has("surfaceTime") && Number.isFinite(requestedTime);
  const guiState: HeightfieldGuiState = {
    quality: qualityLabel(startupQuality),
    waves: search.has("waves") ? search.get("waves") !== "0" : !shoreFoamPreset,
    microNormals: search.has("microNormals") ? search.get("microNormals") !== "0" : !shoreFoamPreset,
    foam: search.has("foam") ? search.get("foam") !== "0" : shoreFoamPreset,
    animateTime: livePresentationEnabled && !hasTimeOverride,
    surfaceTime: hasTimeOverride ? Math.max(0, requestedTime) : 12.5,
    debug: startupDebug
  };
  let featureEnabled = true;

  const engineConfiguration = {
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: {
      webGLMode: WebGLMode.WebGL2
    }
  } as unknown as Parameters<typeof WebGLEngine.create>[0];
  const engine = await WebGLEngine.create(engineConfiguration);
  engine.canvas.resizeByClientSize();
  let cameraFeatureBroker: CameraWaterFeatureBroker | undefined;
  const resizeCanvas = (): void => {
    engine.canvas.resizeByClientSize();
    cameraFeatureBroker?.setViewportSize(engine.canvas.width, engine.canvas.height);
  };
  window.addEventListener("resize", resizeCanvas);

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.026, 0.046, 0.058, 1);
  scene.ambientLight.diffuseSolidColor.set(0.34, 0.41, 0.43, 1);
  scene.ambientLight.diffuseIntensity = 0.56;
  const root = scene.createRootEntity("heightfield-water-demo");

  const cameraEntity = root.createChild("camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 600;
  camera.fieldOfView = 41;
  const orbit = cameraEntity.addComponent(OrbitControl);
  if (shoreFoamPreset) {
    cameraEntity.transform.setPosition(24, 19, 36);
    orbit.target.set(-8, 5.8, 8);
  } else {
    cameraEntity.transform.setPosition(78, 52, 98);
    orbit.target.set(-3, 5.8, -3);
  }
  orbit.minDistance = 24;
  orbit.maxDistance = 320;
  cameraFeatureBroker = new CameraWaterFeatureBroker(camera);
  cameraFeatureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);

  const sunEntity = root.createChild("heightfield-water-sun");
  sunEntity.transform.setRotation(-42, -28, 0);
  const sun = sunEntity.addComponent(DirectLight);
  sun.color = new Color(1, 0.91, 0.76, 1);

  const initialFixture = createRuntimeFixture(startupQuality);
  const bedController = new HeightfieldBedController(engine, root, initialFixture.descriptor);
  bedController.root.isActive = search.get("bed") !== "0";
  const runtimeRoot = root.createChild("heightfield-water-runtime");
  const runtimeController = new HeightfieldWaterRuntimeController(engine, runtimeRoot);
  const waterWorld = new WaterWorld();
  const waterP0Debug = new WaterP0DebugController(waterWorld);
  window.waterPcgP0 = waterP0Debug;
  const compileWorker = new HeightfieldWaterCompileWorkerClient();
  let activeResource: HeightfieldWaterResource | undefined;
  let rebuildRevision = 0;
  let demoMetrics = createEmptyMetrics(startupQuality);

  const applyCameraFeaturePolicy = (quality: WaterQualityTier): void => {
    const screenTexturesRequested = quality !== WaterQualityTier.Low;
    cameraFeatureBroker?.setRequest(
      "heightfield-water",
      screenTexturesRequested
        ? {
            depthTexture: true,
            opaqueTexture: true,
            reflection: "none",
            caustics: false,
            underwater: false,
            quality: quality === WaterQualityTier.High ? "high" : "medium",
            opaqueDownsampling: quality === WaterQualityTier.High ? Downsampling.None : Downsampling.TwoX
          }
        : undefined
    );
    const cameraMetrics = cameraFeatureBroker?.metrics;
    metricsElement.dataset.depthTextureRequested = String(screenTexturesRequested);
    metricsElement.dataset.opaqueTextureRequested = String(screenTexturesRequested);
    metricsElement.dataset.cameraFeatureConsumerCount = String(cameraMetrics?.activeConsumerCount ?? 0);
    metricsElement.dataset.cameraCopyDepthPassCount = String(cameraMetrics?.depthCopyPassCount ?? 0);
    metricsElement.dataset.cameraCopyColorPassCount = String(cameraMetrics?.colorCopyPassCount ?? 0);
    metricsElement.dataset.cameraFeatureRenderTargetBytes = String(cameraMetrics?.estimatedRenderTargetBytes ?? 0);
    metricsElement.dataset.opaqueTextureDownsampling = screenTexturesRequested
      ? quality === WaterQualityTier.High
        ? "none"
        : "2x"
      : "off";
  };

  const applyPresentation = (): void => {
    const wavesEnabled = shoreFoamPreset ? guiState.waves : featureEnabled && guiState.waves;
    const microNormalsEnabled = shoreFoamPreset ? guiState.microNormals : featureEnabled && guiState.microNormals;
    const foamEnabled = shoreFoamPreset ? featureEnabled && guiState.foam : guiState.foam;
    runtimeController.setDebugMode(DEBUG_OPTIONS[guiState.debug]);
    runtimeController.setFeatureFlags({
      waves: wavesEnabled,
      microNormals: microNormalsEnabled,
      foam: foamEnabled
    });
    runtimeController.setSurfaceTimeOverride(guiState.animateTime ? undefined : guiState.surfaceTime);
    metricsElement.dataset.featureEnabled = String(featureEnabled);
    metricsElement.dataset.wavesEnabled = String(wavesEnabled);
    metricsElement.dataset.microNormalsEnabled = String(microNormalsEnabled);
    metricsElement.dataset.foamEnabled = String(foamEnabled);
  };

  const setRuntimeError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    demoMetrics = createEmptyMetrics(QUALITY_OPTIONS[guiState.quality], message);
    metricsElement.dataset.runtimeError = message;
    setStatus("compile failed", "error");
  };

  const compileAndActivate = async (quality: WaterQualityTier): Promise<void> => {
    const revision = ++rebuildRevision;
    setStatus(`compiling ${quality}`, "loading");
    metricsElement.dataset.runtimeError = "";
    applyCameraFeaturePolicy(quality);
    let nextResource: HeightfieldWaterResource | undefined;
    try {
      const fixture = createRuntimeFixture(quality);
      nextResource = await compileWorker.compile(fixture.descriptor);
      if (revision !== rebuildRevision) {
        nextResource.dispose();
        return;
      }
      applyPresentation();
      const activation = await runtimeController.replaceActiveIncremental(fixture.descriptor.id, nextResource, {
        frameBudgetMs: 4,
        shouldCancel: () => revision !== rebuildRevision
      });
      if (revision !== rebuildRevision) {
        nextResource.dispose();
        return;
      }
      const grid = nextResource.data.grid;
      const halfCellX = grid.cellSizeXZ[0] * 0.5;
      const halfCellZ = grid.cellSizeXZ[1] * 0.5;
      waterWorld.unregister(fixture.descriptor.id);
      waterWorld.register(
        new WaterBodyRuntimeAdapter({
          id: fixture.descriptor.id,
          type: "heightfield",
          capabilities: getWaterBodyCapabilities("heightfield"),
          surface: activation.surfaceProvider,
          bounds: {
            minX: grid.originXZ[0] - halfCellX,
            minZ: grid.originXZ[1] - halfCellZ,
            maxX: grid.originXZ[0] + (grid.width - 1) * grid.cellSizeXZ[0] + halfCellX,
            maxZ: grid.originXZ[1] + (grid.height - 1) * grid.cellSizeXZ[1] + halfCellZ
          },
          priority: 0,
          metrics: {
            meshUploadCount: activation.meshUploadCount,
            drawCount: nextResource.data.chunks.length,
            triangleCount: nextResource.data.stats.triangleCount,
            resourceBytes: nextResource.byteLength
          }
        })
      );
      metricsElement.dataset.waterCapabilityMatrix = JSON.stringify(waterP0Debug.capabilityMatrix);
      metricsElement.dataset.waterWorldBodyCount = String(waterWorld.metrics.registeredBodyCount);
      const previousResource = activeResource;
      activeResource = nextResource;
      nextResource = undefined;
      previousResource?.dispose();
      runtimeController.flushDeferredResources();
      const compiledData = activeResource.data as HeightfieldWaterCompiledData;
      demoMetrics = writeCompiledMetrics(compiledData, activation);
      setStatus("surface ready", "ready");
    } catch (error) {
      nextResource?.dispose();
      if (revision === rebuildRevision) setRuntimeError(error);
    }
  };

  let gui: dat.GUI | undefined;
  gui = new dat.GUI({ name: "Heightfield water" });
  gui
    .add(guiState, "quality", Object.keys(QUALITY_OPTIONS) as QualityLabel[])
    .name("Quality")
    .onChange((label: QualityLabel) => void compileAndActivate(QUALITY_OPTIONS[label]));
  gui.add(guiState, "waves").name("Waves").onChange(applyPresentation);
  gui.add(guiState, "microNormals").name("Micro normals").onChange(applyPresentation);
  gui.add(guiState, "foam").name("Shore foam").onChange(applyPresentation);
  gui.add(guiState, "animateTime").name("Live time").onChange(applyPresentation);
  gui
    .add(guiState, "surfaceTime", 0, 4096, 0.1)
    .name("Surface time")
    .onChange(() => {
      guiState.animateTime = false;
      applyPresentation();
    });
  gui
    .add(guiState, "debug", Object.keys(DEBUG_OPTIONS) as DebugLabel[])
    .name("Debug")
    .onChange(applyPresentation);

  window.heightfieldWaterDemo = {
    get metrics() {
      return demoMetrics;
    },
    get featureEnabled() {
      return featureEnabled;
    },
    async setQuality(quality: WaterQualityTier): Promise<void> {
      guiState.quality = qualityLabel(quality);
      await compileAndActivate(quality);
    },
    setDebugMode(mode: HeightfieldWaterDebugMode): void {
      const entry = Object.entries(DEBUG_OPTIONS).find(([, value]) => value === mode);
      guiState.debug = (entry?.[0] as DebugLabel | undefined) ?? "Final";
      applyPresentation();
    },
    setSurfaceTime(elapsedTime?: number): void {
      guiState.animateTime = elapsedTime === undefined;
      if (elapsedTime !== undefined) guiState.surfaceTime = Math.max(0, elapsedTime);
      applyPresentation();
    },
    setFeatureEnabled(enabled: boolean): void {
      featureEnabled = enabled;
      applyPresentation();
    },
    reset(): void {
      featureEnabled = true;
      guiState.waves = !shoreFoamPreset;
      guiState.microNormals = !shoreFoamPreset;
      guiState.foam = shoreFoamPreset;
      guiState.animateTime = false;
      guiState.surfaceTime = 12.5;
      guiState.debug = "Final";
      applyPresentation();
    }
  };
  const featureApi: WaterFeatureCaseApi = {
    caseId: document.documentElement.dataset.waterPcgCase ?? "",
    preset: routePreset ?? "heightfield",
    get ready() {
      return demoMetrics.ready;
    },
    get enabled() {
      return featureEnabled;
    },
    setEnabled(enabled: boolean): void {
      window.heightfieldWaterDemo?.setFeatureEnabled(enabled);
    },
    reset(): void {
      window.heightfieldWaterDemo?.reset();
    },
    snapshot() {
      return createFeatureSnapshot(
        featureApi,
        demoMetrics.runtimeError,
        demoMetrics.runtimeError === "" && demoMetrics.ready,
        featureEnabled ? 1 : 0
      );
    }
  };
  window.waterPcgFeature = featureApi;

  applyPresentation();
  engine.run();
  await compileAndActivate(startupQuality);

  window.addEventListener("beforeunload", () => {
    rebuildRevision++;
    window.removeEventListener("resize", resizeCanvas);
    cameraFeatureBroker?.destroy();
    gui?.destroy();
    window.heightfieldWaterDemo = undefined;
    delete window.waterPcgFeature;
    runtimeController.destroy();
    waterWorld.destroy();
    window.waterPcgP0 = undefined;
    activeResource?.dispose();
    compileWorker.dispose();
    bedController.destroy();
  });
}

void bootstrapHeightfieldWater().catch((error: unknown) => {
  console.error(error instanceof Error ? error : new Error("Heightfield water demo bootstrap failed."));
  const message = error instanceof Error ? error.message : String(error);
  metricsElement.dataset.runtimeError = message;
  setStatus("bootstrap failed", "error");
});
