/**
 * @title Global Illumination
 * @category Light
 */
import * as dat from "dat.gui";
import { FreeControl } from "@galacean/engine-toolkit-controls";
import { Stats } from "@galacean/engine-toolkit-stats";
import {
  AssetType,
  Camera,
  DiffuseMode,
  DirectLight,
  Keys,
  Logger,
  Material,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  ProbeBrickProbeCountPerDimension,
  ProbeVolume,
  ProbeVolumeBaker,
  ProbeVolumeBinary,
  ProbeVolumeRegion,
  ProbeVolumeSamplingMode,
  Renderer,
  Script,
  Shader,
  ShaderProperty,
  SphericalHarmonics3,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import type { Entity, ProbeVolumeManifestJSON, Scene } from "@galacean/engine";
import { ProbeVolumeStreamingController } from "./ProbeVolumeStreamingController";
import {
  globalIlluminationBakePresetOrder,
  globalIlluminationBakePresets,
  globalIlluminationDayProjectUrl
} from "./projectSources";
import type { GlobalIlluminationBakePresetKey } from "./projectSources";
import probeVolumeManifestUrl from "./probe-volume-manifest.json?url";

const searchParams = new URLSearchParams(window.location.search);
const requestedBakePreset = searchParams.get("bake");
const runtimePreviewRequested = searchParams.get("runtime") === "1";
const activeBakePresetKey = runtimePreviewRequested
  ? null
  : isBakePresetKey(requestedBakePreset)
    ? requestedBakePreset
    : "dawn";
const activeBakePreset = activeBakePresetKey ? globalIlluminationBakePresets[activeBakePresetKey] : null;
const projectUrl = activeBakePreset?.url ?? globalIlluminationDayProjectUrl;
const dayScenario = "Noon";
const nightScenario = "Night";
const probeMarkerSHProperty = ShaderProperty.getByName("renderer_ProbeSH");
const probeMarkerExposureProperty = ShaderProperty.getByName("scene_ProbeMarkerExposure");
const finalLightingPreviewModes = ["Source (No Probe)", "Final Combined", "Probe + Sun Only"] as const;
type FinalLightingPreviewMode = (typeof finalLightingPreviewModes)[number];

interface LightingPresetSnapshot {
  version: 1;
  key: GlobalIlluminationBakePresetKey;
  label: string;
  scenario: string;
  sourceProjectUrl: string;
  probeVolumeFile: string;
  separateEnvironment: false;
  ambient: {
    diffuseMode: DiffuseMode;
    diffuseIntensity: number;
    diffuseSolidColor: [number, number, number, number];
    diffuseSphericalHarmonics: number[] | null;
    specularIntensity: number;
    hasSpecularTexture: boolean;
  };
  sun: {
    color: [number, number, number, number];
    rotation: [number, number, number];
    direction: [number, number, number];
    shadowStrength: number;
  } | null;
}

interface ProbeBakeRegionSnapshot {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  size: [number, number, number];
  minBrickSize: number;
}

interface ProbeBakeCacheRecord {
  version: 1;
  key: GlobalIlluminationBakePresetKey;
  sourceProjectUrl: string;
  savedAt: number;
  placement: "Uniform" | "Adaptive";
  maxSubdivisionLevel: number;
  region: ProbeBakeRegionSnapshot;
  probeVolume: ArrayBuffer;
}

const probeBakeCacheDatabaseName = "galacean-world-gallery";
const probeBakeCacheStoreName = "global-illumination-probe-bakes";
const probeBakeCacheDatabaseVersion = 1;

class VerticalRoamControl extends Script {
  movementSpeed = 3;

  onUpdate(deltaTime: number): void {
    const input = this.engine.inputManager;
    let direction = 0;
    if (input.isKeyHeldDown(Keys.KeyE) || input.isKeyHeldDown(Keys.Space)) {
      direction += 1;
    }
    if (input.isKeyHeldDown(Keys.KeyQ) || input.isKeyHeldDown(Keys.ShiftLeft) || input.isKeyHeldDown(Keys.ShiftRight)) {
      direction -= 1;
    }

    if (direction !== 0) {
      const position = this.entity.transform.position;
      this.entity.transform.setPosition(
        position.x,
        position.y + direction * this.movementSpeed * deltaTime,
        position.z
      );
    }
  }
}

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then((engine) => {
  engine.canvas.resizeByClientSize();
  engine.resourceManager.retryCount = 2;

  window.addEventListener("resize", () => {
    engine.canvas.resizeByClientSize();
  });

  engine.run();

  engine.resourceManager
    .load({
      type: AssetType.Project,
      url: projectUrl
    })
    .then(() => {
      const scene = engine.sceneManager.activeScene;
      installFreeControl(scene);
      if (!activeBakePreset) {
        normalizeProbeDemoMaterials(engine, scene);
      }
      return installLightProbe(engine, scene);
    })
    .catch((error) => {
      Logger.error("light", error);
      console.error("light", error);
    });
});

function installFreeControl(scene: Scene): void {
  const camera = scene.rootEntities
    .map((entity) => entity.getComponent(Camera))
    .find((component): component is Camera => Boolean(component?.enabled));
  if (!camera) {
    throw new Error("The light demo requires an enabled scene camera.");
  }

  const control = camera.entity.getComponent(FreeControl) ?? camera.entity.addComponent(FreeControl);
  control.movementSpeed = 3;
  control.floorMock = false;

  const verticalControl =
    camera.entity.getComponent(VerticalRoamControl) ?? camera.entity.addComponent(VerticalRoamControl);
  verticalControl.movementSpeed = control.movementSpeed;

  camera.entity.getComponent(Stats) ?? camera.entity.addComponent(Stats);
  installStatsPanelStyle();
}

function installStatsPanelStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
    body .gl-perf {
      top: auto;
      bottom: 12px;
      left: 12px;
      z-index: 10;
      min-width: 156px;
      padding: 9px 11px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 4px;
      background: rgba(12, 15, 18, 0.82);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
      color: #f3f5f7;
      font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    body .gl-perf dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 3px 14px;
    }

    body .gl-perf dt,
    body .gl-perf dd {
      color: inherit;
      font-size: 11px;
      line-height: 1.35;
      text-shadow: none;
    }

    body .gl-perf dt .unit {
      font-size: 10px;
      color: #aeb7c0;
    }

    body .gl-perf dd {
      padding: 0;
      text-align: right;
      color: #76d6a5;
      font-variant-numeric: tabular-nums;
    }
  `;
  document.head.appendChild(style);
}

function normalizeProbeDemoMaterials(engine: WebGLEngine, scene: Scene): void {
  const diffuseMaterial = new PBRMaterial(engine);
  diffuseMaterial.metallic = 0;
  diffuseMaterial.roughness = 1;
  diffuseMaterial.baseColor.set(0.92, 0.92, 0.92, 1);

  scene.rootEntities.forEach((entity) => {
    if (entity.name === "Cuboid") {
      entity.getComponent(MeshRenderer)?.setMaterial(diffuseMaterial);
    } else if (entity.name === "Sphere") {
      entity.getComponent(MeshRenderer)?.getMaterial()?.shaderData.enableMacro("MATERIAL_DISABLE_PROBE_VOLUME");
    }
  });
}

async function installLightProbe(engine: WebGLEngine, scene: Scene): Promise<void> {
  const camera = scene.rootEntities
    .map((entity) => entity.getComponent(Camera))
    .find((component): component is Camera => Boolean(component?.enabled));
  if (!camera) {
    throw new Error("The probe demo requires an enabled scene camera.");
  }
  const lightingPreset =
    activeBakePreset && activeBakePresetKey
      ? captureLightingPresetSnapshot(scene, activeBakePresetKey, activeBakePreset)
      : null;
  const probeVolumeFile = `probe-volume-${(activeBakePresetKey ?? "noon").toLowerCase()}.pvol`;
  const regionEntity = scene.createRootEntity("probe_volume_region");
  const region = regionEntity.addComponent(ProbeVolumeRegion);
  region.size.set(32, 14, 20);
  const cachedBakes = activeBakePreset ? await listProbeBakeCacheRecords() : [];
  const activeCachedBake =
    activeBakePreset && activeBakePresetKey
      ? (cachedBakes.find(
          (record) =>
            record.key === activeBakePresetKey &&
            record.sourceProjectUrl === activeBakePreset.url &&
            record.version === 1
        ) ?? null)
      : null;
  const probeManifest = await fetch(probeVolumeManifestUrl).then(
    (response) => response.json() as Promise<ProbeVolumeManifestJSON>
  );
  let probeVolume = ProbeVolume.fromManifestJSON(probeManifest);
  probeVolume.lightingScenario = dayScenario;
  region.minBrickSize = Math.max(probeVolume.minBrickSize, 8);
  fitProbeRegionToScene(scene, region);

  scene.environmentLighting.probeVolumeAnchor = camera.entity.transform;
  const streamingController = camera.entity.addComponent(ProbeVolumeStreamingController);
  await streamingController.initialize(probeVolume, probeVolumeManifestUrl);
  if (activeCachedBake) {
    const manifestVolume = probeVolume;
    probeVolume = ProbeVolumeBinary.decode(activeCachedBake.probeVolume.slice(0));
    applyProbeBakeRegionSnapshot(region, activeCachedBake.region);
    streamingController.enabled = false;
    manifestVolume.dispose();
  }
  probeVolume.samplingMode = ProbeVolumeSamplingMode.PerFragment;
  scene.shaderData.setFloat(probeMarkerExposureProperty, 0);
  let markerRoot = createProbeMarkers(engine, scene, probeVolume);
  let hasRuntimeBakedVolume = Boolean(activeCachedBake);
  let bakedLightingEnabled = !activeBakePreset || hasRuntimeBakedVolume;
  scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
  let isBaking = false;
  let previewRequest = 0;
  const bakeScenario = activeBakePreset?.scenario ?? dayScenario;
  const updateAvailableScenarios = (): string => probeVolume.lightingScenarioNames.join(", ");
  const updateCachedBakeSummary = (): string => formatCachedBakeSummary(cachedBakes);
  const updateSelectedBakeStatus = (key: GlobalIlluminationBakePresetKey): string =>
    formatSelectedBakeStatus(key, cachedBakes);
  const controls = {
    showMarkers: false,
    probeExposure: 0,
    sampling: "Per Fragment",
    projectMode: activeBakePreset ? `${activeBakePreset.label} Bake Source` : "Runtime Preview",
    bakeSource: activeBakePresetKey ?? ("dawn" as GlobalIlluminationBakePresetKey),
    availableScenarios: activeBakePreset
      ? activeCachedBake
        ? updateAvailableScenarios()
        : `Bake target: ${bakeScenario}`
      : updateAvailableScenarios(),
    dayNightBlend: 0,
    scenarioStatus: activeBakePreset
      ? activeCachedBake
        ? `${bakeScenario} cached bake restored`
        : "No cached bake for this source"
      : probeVolume.lightingScenarioNames.includes(nightScenario)
        ? "Noon and Night loaded"
        : "Bake Night to enable blending",
    streamingStatus: activeCachedBake ? "Cached bake preview is monolithic" : streamingController.status,
    residentChunks: activeCachedBake
      ? `${probeVolume.cells.length > 0 ? 1 : 0}/1`
      : `${streamingController.residentChunkCount}/${streamingController.totalChunkCount}`,
    residentProbeData: activeCachedBake
      ? `${probeVolume.cells.length} cells / ${probeVolume.bricks.length} bricks`
      : `${streamingController.residentCellCount} cells / ${streamingController.residentBrickCount} bricks`,
    savedBakes: updateCachedBakeSummary(),
    selectedBakeStatus: updateSelectedBakeStatus(activeBakePresetKey ?? "dawn"),
    placement: activeCachedBake?.placement ?? "Uniform",
    maxSubdivisionLevel: activeCachedBake?.maxSubdivisionLevel ?? 1,
    bakeStatus: activeBakePreset
      ? activeCachedBake
        ? `Restored ${formatCacheTimestamp(activeCachedBake.savedAt)}`
        : `${activeBakePreset.label}: not baked in this browser`
      : "Loaded",
    lightingPreset: activeBakePreset?.label ?? "Runtime scenarios",
    ambientStatus: lightingPreset
      ? `${lightingPreset.ambient.diffuseSphericalHarmonics ? "SH" : "Solid"} × ${lightingPreset.ambient.diffuseIntensity}`
      : "Runtime-owned",
    sunStatus: lightingPreset?.sun
      ? `RGB ${formatColorTriplet(lightingPreset.sun.color)}`
      : activeBakePreset
        ? "No active sun"
        : "Runtime-owned",
    finalPreview: (activeCachedBake ? "Final Combined" : "Source (No Probe)") as FinalLightingPreviewMode,
    finalLightingStatus: activeBakePreset
      ? activeCachedBake
        ? "Final = cached Probe + sky-visible Ambient SH + Sun"
        : "Source preview; Probe disabled"
      : "Runtime-owned",
    refreshBakedLightingLabel: () => {},
    get bakedLightingEnabled(): boolean {
      return bakedLightingEnabled;
    },
    toggleBakedLighting: () => {
      bakedLightingEnabled = !bakedLightingEnabled;
      scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
      camera.render();
    },
    updateSampling: (value: string) => {
      probeVolume.samplingMode = samplingModes[value];
      scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
      camera.render();
    },
    updateProbeExposure: (value: number) => {
      scene.shaderData.setFloat(probeMarkerExposureProperty, value);
      camera.render();
    },
    updateFinalLightingPreview: (value: FinalLightingPreviewMode) => {
      controls.finalPreview = value;
      if (!lightingPreset) {
        return;
      }
      applyLightingPresetSnapshot(scene, lightingPreset, value !== "Probe + Sun Only");
      const wantsProbe = value !== "Source (No Probe)";
      bakedLightingEnabled = hasRuntimeBakedVolume && wantsProbe;
      scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
      controls.refreshBakedLightingLabel();
      if (hasRuntimeBakedVolume) {
        controls.finalLightingStatus =
          value === "Source (No Probe)"
            ? "Source = Ambient SH + Sun; Probe disabled"
            : value === "Final Combined"
              ? "Final = baked Probe + sky-visible Ambient SH + Sun"
              : "Baked Probe + Sun; Ambient disabled";
      } else {
        controls.finalLightingStatus = wantsProbe
          ? "Bake the Probe to enable this preview"
          : "Source preview; Probe disabled";
      }
      camera.render();
    },
    downloadLightingPreset: () => {
      if (!lightingPreset || !hasRuntimeBakedVolume) {
        controls.finalLightingStatus = "Bake the Probe before exporting the preset";
        return;
      }
      downloadLightingPresetArtifact(lightingPreset, region, controls.finalPreview);
      controls.finalLightingStatus = `${lightingPreset.label} preset exported`;
    },
    updateDayNightBlend: (value: number) => {
      if (!probeVolume.lightingScenarioNames.includes(nightScenario)) {
        controls.dayNightBlend = 0;
        controls.scenarioStatus = "Bake Night to enable blending";
        camera.render();
        return;
      }

      const factor = Math.max(0, Math.min(1, value));
      controls.dayNightBlend = factor;
      if (factor === 0) {
        probeVolume.lightingScenario = dayScenario;
      } else if (factor === 1) {
        probeVolume.lightingScenario = nightScenario;
      } else {
        if (probeVolume.lightingScenario !== dayScenario) {
          probeVolume.lightingScenario = dayScenario;
        }
        probeVolume.blendLightingScenario(nightScenario, factor);
      }
      controls.scenarioStatus = `GPU indirect blend ${(factor * 100).toFixed(0)}% Night`;
      camera.render();
    },
    pinAllChunks: async () => {
      controls.streamingStatus = "Loading all chunks";
      await streamingController.pinAllChunks();
      updateStreamingControls();
      camera.render();
    },
    updateBakeSource: (value: GlobalIlluminationBakePresetKey) => {
      controls.bakeSource = value;
      controls.selectedBakeStatus = updateSelectedBakeStatus(value);
      const url = new URL(window.location.href);
      url.searchParams.delete("runtime");
      url.searchParams.set("bake", value);
      window.location.href = url.toString();
    },
    returnToRuntime: () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("bake");
      url.searchParams.set("runtime", "1");
      window.location.href = url.toString();
    },
    downloadScenarios: async () => {
      controls.streamingStatus = "Loading all chunks for export";
      await streamingController.pinAllChunks();
      updateStreamingControls();
      downloadProbeVolumeArtifact(probeVolume, "probe-volume-scenarios.pvol");
    },
    bake: async () => {
      if (isBaking) {
        return;
      }
      if (previewRequest) {
        cancelAnimationFrame(previewRequest);
        previewRequest = 0;
      }
      isBaking = true;
      streamingController.enabled = false;
      controls.streamingStatus = "Suspended for runtime bake";
      controls.bakeStatus = "Preparing";
      const previousVolume = probeVolume;
      const previousHasRuntimeBakedVolume = hasRuntimeBakedVolume;
      markerRoot.destroy();
      try {
        probeVolume = await ProbeVolumeBaker.bakeRegion(scene, region, {
          lightingScenario: bakeScenario,
          camera,
          resolution: 8,
          nearClipPlane: 0.05,
          farClipPlane: 60,
          bounceCount: 2,
          indirectIntensity: 2,
          separateEnvironment: false,
          bakeSunIndirect: true,
          placementMode: controls.placement === "Adaptive" ? "adaptive" : "uniform",
          maxSubdivisionLevel: controls.maxSubdivisionLevel,
          probesPerBatch: 1,
          onProgress: ({ completedProbes, totalProbes, bounce, bounceCount }) => {
            const percentage = totalProbes > 0 ? Math.round((completedProbes / totalProbes) * 100) : 0;
            controls.bakeStatus = `${completedProbes}/${totalProbes} (${percentage}%) - Bounce ${bounce}/${bounceCount}`;
          }
        });
        probeVolume.normalBias = 0.2;
        probeVolume.samplingMode = samplingModes[controls.sampling];
        hasRuntimeBakedVolume = true;
        controls.finalPreview = "Final Combined";
        controls.updateFinalLightingPreview(controls.finalPreview);
        markerRoot = createProbeMarkers(engine, scene, probeVolume);
        markerRoot.isActive = controls.showMarkers;
        controls.dayNightBlend = 0;
        controls.availableScenarios = updateAvailableScenarios();
        controls.scenarioStatus = `${bakeScenario} baked`;
        let cacheSaveError: unknown = null;
        if (activeBakePreset && activeBakePresetKey) {
          controls.bakeStatus = "Saving browser cache";
          const cacheRecord: ProbeBakeCacheRecord = {
            version: 1,
            key: activeBakePresetKey,
            sourceProjectUrl: activeBakePreset.url,
            savedAt: Date.now(),
            placement: controls.placement === "Adaptive" ? "Adaptive" : "Uniform",
            maxSubdivisionLevel: controls.maxSubdivisionLevel,
            region: captureProbeBakeRegionSnapshot(region),
            probeVolume: ProbeVolumeBinary.encode(probeVolume)
          };
          try {
            await saveProbeBakeCacheRecord(cacheRecord);
            const existingCacheIndex = cachedBakes.findIndex((record) => record.key === activeBakePresetKey);
            if (existingCacheIndex >= 0) {
              cachedBakes[existingCacheIndex] = cacheRecord;
            } else {
              cachedBakes.push(cacheRecord);
            }
            controls.savedBakes = updateCachedBakeSummary();
            controls.selectedBakeStatus = updateSelectedBakeStatus(activeBakePresetKey);
          } catch (error) {
            cacheSaveError = error;
            Logger.error("probe bake cache", error);
            console.error("probe bake cache", error);
          }
        }
        downloadProbeVolumeArtifact(probeVolume, probeVolumeFile);
        if (lightingPreset) {
          downloadLightingPresetArtifact(lightingPreset, region, controls.finalPreview);
        }
        previousVolume.dispose();
        updateStreamingControls();
        controls.bakeStatus = cacheSaveError
          ? `Completed; cache failed: ${cacheSaveError instanceof Error ? cacheSaveError.message : String(cacheSaveError)}`
          : `Completed and cached ${formatCacheTimestamp(Date.now())}`;
        camera.render();
      } catch (error) {
        probeVolume = previousVolume;
        hasRuntimeBakedVolume = previousHasRuntimeBakedVolume;
        if (lightingPreset) {
          controls.updateFinalLightingPreview(controls.finalPreview);
        } else {
          controls.updateDayNightBlend(controls.dayNightBlend);
        }
        markerRoot = createProbeMarkers(engine, scene, probeVolume);
        markerRoot.isActive = controls.showMarkers;
        scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
        if (!previousHasRuntimeBakedVolume) {
          streamingController.enabled = true;
          streamingController.resumeStreaming();
          updateStreamingControls();
        }
        controls.bakeStatus = `Failed: ${error instanceof Error ? error.message : String(error)}`;
        Logger.error("probe bake", error);
        console.error("probe bake", error);
      } finally {
        isBaking = false;
      }
    }
  };
  let markerResidencySignature = probeVolume.loadedChunkIds.join(",");
  const updateStreamingControls = (): void => {
    if (hasRuntimeBakedVolume) {
      controls.streamingStatus = activeCachedBake
        ? "Cached bake preview is monolithic"
        : "Runtime bake preview is monolithic";
      controls.residentChunks = `${probeVolume.cells.length > 0 ? 1 : 0}/1`;
      controls.residentProbeData = `${probeVolume.cells.length} cells / ${probeVolume.bricks.length} bricks`;
    } else {
      controls.streamingStatus = streamingController.status;
      controls.residentChunks = `${streamingController.residentChunkCount}/${streamingController.totalChunkCount}`;
      controls.residentProbeData = `${streamingController.residentCellCount} cells / ${streamingController.residentBrickCount} bricks`;
    }
    const nextMarkerResidencySignature = probeVolume.loadedChunkIds.join(",");
    if (controls.showMarkers && nextMarkerResidencySignature !== markerResidencySignature) {
      const nextMarkerRoot = createProbeMarkers(engine, scene, probeVolume);
      markerRoot.destroy();
      markerRoot = nextMarkerRoot;
    }
    markerResidencySignature = nextMarkerResidencySignature;
  };
  streamingController.onResidencyChanged = () => {
    updateStreamingControls();
    camera.render();
  };
  const refreshLayoutPreview = () => {
    controls.bakeStatus = "Modified";
    if (previewRequest || isBaking) {
      return;
    }
    previewRequest = requestAnimationFrame(() => {
      previewRequest = 0;
      if (isBaking) {
        return;
      }
      try {
        const layout = ProbeVolumeBaker.createRegionLayout(scene, region, {
          placementMode: controls.placement === "Adaptive" ? "adaptive" : "uniform",
          maxSubdivisionLevel: controls.maxSubdivisionLevel
        });
        const nextMarkerRoot = createProbeLayoutMarkers(engine, scene, layout);
        nextMarkerRoot.isActive = controls.showMarkers;
        markerRoot.destroy();
        markerRoot = nextMarkerRoot;
      } catch (error) {
        controls.bakeStatus = `Invalid: ${error instanceof Error ? error.message : String(error)}`;
      }
      camera.render();
    });
  };
  markerRoot.isActive = controls.showMarkers;

  scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
  scene.environmentLighting.probeVolumeAnchor = camera.entity.transform;
  camera.render();
  createProbeDebug(
    region,
    controls,
    (visible) => {
      if (visible) {
        const nextMarkerRoot = createProbeMarkers(engine, scene, probeVolume);
        markerRoot.destroy();
        markerRoot = nextMarkerRoot;
        markerResidencySignature = probeVolume.loadedChunkIds.join(",");
      } else {
        markerRoot.isActive = false;
      }
    },
    refreshLayoutPreview
  );
}

function fitProbeRegionToScene(scene: Scene, region: ProbeVolumeRegion): void {
  const renderers: Renderer[] = [];
  for (const root of scene.rootEntities) {
    const rootRenderers: Renderer[] = [];
    root.getComponentsIncludeChildren(Renderer, rootRenderers);
    renderers.push(...rootRenderers);
  }

  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const renderer of renderers) {
    if (!renderer.enabled) {
      continue;
    }
    const bounds = renderer.bounds;
    if (![bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)) {
      continue;
    }
    min.x = Math.min(min.x, bounds.min.x);
    min.y = Math.min(min.y, bounds.min.y);
    min.z = Math.min(min.z, bounds.min.z);
    max.x = Math.max(max.x, bounds.max.x);
    max.y = Math.max(max.y, bounds.max.y);
    max.z = Math.max(max.z, bounds.max.z);
  }

  if (!Number.isFinite(min.x)) {
    throw new Error("The probe demo requires at least one enabled renderer.");
  }

  region.entity.transform.position.set((min.x + max.x) * 0.5, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);
}

function captureLightingPresetSnapshot(
  scene: Scene,
  key: GlobalIlluminationBakePresetKey,
  source: { label: string; scenario: string; url: string }
): LightingPresetSnapshot {
  const ambient = scene.ambientLight;
  const ambientSH = ambient.diffuseSphericalHarmonics;
  const sun = findScenarioSun(scene, source.scenario) ?? findActiveSun(scene);
  const sunRotation = sun?.entity.transform.rotation;
  const sunDirection = sun?.direction;
  return {
    version: 1,
    key,
    label: source.label,
    scenario: source.scenario,
    sourceProjectUrl: source.url,
    probeVolumeFile: `probe-volume-${key}.pvol`,
    separateEnvironment: false,
    ambient: {
      diffuseMode: ambient.diffuseMode,
      diffuseIntensity: ambient.diffuseIntensity,
      diffuseSolidColor: [
        ambient.diffuseSolidColor.r,
        ambient.diffuseSolidColor.g,
        ambient.diffuseSolidColor.b,
        ambient.diffuseSolidColor.a
      ],
      diffuseSphericalHarmonics: ambientSH ? Array.from(ambientSH.coefficients) : null,
      specularIntensity: ambient.specularIntensity,
      hasSpecularTexture: Boolean(ambient.specularTexture)
    },
    sun:
      sun && sunRotation && sunDirection
        ? {
            color: [sun.color.r, sun.color.g, sun.color.b, sun.color.a],
            rotation: [sunRotation.x, sunRotation.y, sunRotation.z],
            direction: [sunDirection.x, sunDirection.y, sunDirection.z],
            shadowStrength: sun.shadowStrength
          }
        : null
  };
}

function findActiveSun(scene: Scene): DirectLight | null {
  if (scene.sun?.enabled && scene.sun.entity.isActiveInHierarchy) {
    return scene.sun;
  }
  const lights: DirectLight[] = [];
  for (const root of scene.rootEntities) {
    root.getComponentsIncludeChildren(DirectLight, lights);
  }
  return lights.find((light) => light.enabled && light.entity.isActiveInHierarchy) ?? null;
}

function findScenarioSun(scene: Scene, scenario: string): DirectLight | null {
  const normalizedScenario = scenario.toLowerCase();
  const scenarioRoot = scene.rootEntities.find((entity) => entity.name.toLowerCase() === normalizedScenario);
  if (!scenarioRoot) {
    return null;
  }
  const lights: DirectLight[] = [];
  scenarioRoot.getComponentsIncludeChildren(DirectLight, lights);
  return lights.find((light) => light.enabled) ?? null;
}

function applyLightingPresetSnapshot(scene: Scene, preset: LightingPresetSnapshot, environmentEnabled: boolean): void {
  const ambient = scene.ambientLight;
  ambient.diffuseMode = preset.ambient.diffuseMode;
  ambient.diffuseSolidColor.set(...preset.ambient.diffuseSolidColor);
  if (preset.ambient.diffuseSphericalHarmonics) {
    const sh = new SphericalHarmonics3();
    sh.copyFromArray(preset.ambient.diffuseSphericalHarmonics);
    ambient.diffuseSphericalHarmonics = sh;
  }
  ambient.diffuseIntensity = environmentEnabled ? preset.ambient.diffuseIntensity : 0;
  ambient.specularIntensity = environmentEnabled ? preset.ambient.specularIntensity : 0;

  const sun = findActiveSun(scene);
  if (sun && preset.sun) {
    sun.color.set(...preset.sun.color);
    sun.entity.transform.rotation.set(...preset.sun.rotation);
    sun.shadowStrength = preset.sun.shadowStrength;
  }
}

function captureProbeBakeRegionSnapshot(region: ProbeVolumeRegion): ProbeBakeRegionSnapshot {
  return {
    position: vectorToArray(region.entity.transform.position),
    rotation: vectorToArray(region.entity.transform.rotation),
    scale: vectorToArray(region.entity.transform.scale),
    size: vectorToArray(region.size),
    minBrickSize: region.minBrickSize
  };
}

function applyProbeBakeRegionSnapshot(region: ProbeVolumeRegion, snapshot: ProbeBakeRegionSnapshot): void {
  region.entity.transform.position.set(...snapshot.position);
  region.entity.transform.rotation.set(...snapshot.rotation);
  region.entity.transform.scale.set(...snapshot.scale);
  region.size.set(...snapshot.size);
  region.minBrickSize = snapshot.minBrickSize;
}

async function listProbeBakeCacheRecords(): Promise<ProbeBakeCacheRecord[]> {
  let database: IDBDatabase | null = null;
  try {
    database = await openProbeBakeCacheDatabase();
    return await new Promise<ProbeBakeCacheRecord[]>((resolve, reject) => {
      const request = database!
        .transaction(probeBakeCacheStoreName, "readonly")
        .objectStore(probeBakeCacheStoreName)
        .getAll();
      request.onsuccess = () => {
        resolve(
          (request.result as ProbeBakeCacheRecord[]).filter(
            (record) =>
              record?.version === 1 &&
              isBakePresetKey(record.key) &&
              typeof record.sourceProjectUrl === "string" &&
              record.probeVolume instanceof ArrayBuffer
          )
        );
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to read the Probe bake cache."));
    });
  } catch (error) {
    Logger.warn(`Probe bake cache is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  } finally {
    database?.close();
  }
}

async function saveProbeBakeCacheRecord(record: ProbeBakeCacheRecord): Promise<void> {
  const database = await openProbeBakeCacheDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(probeBakeCacheStoreName, "readwrite");
      transaction.objectStore(probeBakeCacheStoreName).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save the Probe bake cache."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving the Probe bake cache was aborted."));
    });
  } finally {
    database.close();
  }
}

function openProbeBakeCacheDatabase(): Promise<IDBDatabase> {
  if (!window.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not supported by this browser."));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(probeBakeCacheDatabaseName, probeBakeCacheDatabaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(probeBakeCacheStoreName)) {
        database.createObjectStore(probeBakeCacheStoreName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open the Probe bake cache."));
    request.onblocked = () => reject(new Error("Opening the Probe bake cache was blocked by another page."));
  });
}

function formatCachedBakeSummary(records: readonly ProbeBakeCacheRecord[]): string {
  const cachedKeys = new Set(
    records
      .filter((record) => record.sourceProjectUrl === globalIlluminationBakePresets[record.key].url)
      .map((record) => record.key)
  );
  const labels = globalIlluminationBakePresetOrder
    .filter((key) => cachedKeys.has(key))
    .map((key) => globalIlluminationBakePresets[key].label);
  return labels.length > 0 ? `${labels.join(", ")} (${labels.length}/6)` : "None (0/6)";
}

function formatSelectedBakeStatus(
  key: GlobalIlluminationBakePresetKey,
  records: readonly ProbeBakeCacheRecord[]
): string {
  const preset = globalIlluminationBakePresets[key];
  const record = records.find(
    (candidate) => candidate.key === key && candidate.version === 1 && candidate.sourceProjectUrl === preset.url
  );
  return record ? `${preset.label}: cached ${formatCacheTimestamp(record.savedAt)}` : `${preset.label}: not baked`;
}

function formatCacheTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function downloadLightingPresetArtifact(
  preset: LightingPresetSnapshot,
  region: ProbeVolumeRegion,
  previewMode: FinalLightingPreviewMode
): void {
  const artifact = {
    ...preset,
    composition: {
      previewMode,
      diffuseIndirect: "bakedProbe + ambientSH * probeSkyVisibility",
      bakedProbeIncludes: "sun/local/emissive/environment indirect",
      runtimeDirect: "sun + ambientSH"
    },
    region: captureProbeBakeRegionSnapshot(region)
  };
  downloadTextArtifact(JSON.stringify(artifact, null, 2), `lighting-preset-${preset.key}.json`, "application/json");
}

function downloadProbeVolumeArtifact(volume: ProbeVolume, fileName: string): void {
  const url = URL.createObjectURL(new Blob([ProbeVolumeBinary.encode(volume)], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadTextArtifact(text: string, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function vectorToArray(value: Vector3): [number, number, number] {
  return [value.x, value.y, value.z];
}

function formatColorTriplet(color: readonly number[]): string {
  return color
    .slice(0, 3)
    .map((value) => value.toFixed(2))
    .join(", ");
}

function createProbeMarkers(engine: WebGLEngine, scene: Scene, volume: ProbeVolume): Entity {
  const markerRoot = scene.createRootEntity("probe_markers");
  const markerMesh = PrimitiveMesh.createSphere(engine, 0.1, 12);
  const markerMaterial = createProbeMarkerMaterial(engine);
  const minimumProbeStep = volume.minBrickSize / (ProbeBrickProbeCountPerDimension - 1);
  const createdProbeKeys = new Set<string>();
  const localPosition = new Vector3();
  const worldPosition = new Vector3();

  for (const brick of volume.bricks) {
    const brickSize = volume.minBrickSize * Math.pow(ProbeBrickProbeCountPerDimension - 1, brick.subdivisionLevel);
    const probeStep = brickSize / (ProbeBrickProbeCountPerDimension - 1);
    for (let z = 0; z < ProbeBrickProbeCountPerDimension; z++) {
      for (let y = 0; y < ProbeBrickProbeCountPerDimension; y++) {
        for (let x = 0; x < ProbeBrickProbeCountPerDimension; x++) {
          localPosition.set(
            brick.position.x + x * probeStep,
            brick.position.y + y * probeStep,
            brick.position.z + z * probeStep
          );
          const key = `${Math.round(localPosition.x / minimumProbeStep)},${Math.round(
            localPosition.y / minimumProbeStep
          )},${Math.round(localPosition.z / minimumProbeStep)}`;
          if (createdProbeKeys.has(key)) {
            continue;
          }
          createdProbeKeys.add(key);

          Vector3.transformCoordinate(localPosition, volume.localToWorldMatrix, worldPosition);
          const marker = markerRoot.createChild("probe");
          marker.transform.position.copyFrom(worldPosition);

          const renderer = marker.addComponent(MeshRenderer);
          renderer.mesh = markerMesh;
          renderer.setMaterial(markerMaterial);
          const probeIndex = x + ProbeBrickProbeCountPerDimension * (y + ProbeBrickProbeCountPerDimension * z);
          renderer.shaderData.setFloatArray(probeMarkerSHProperty, brick.sphericalHarmonics[probeIndex].coefficients);
        }
      }
    }
  }

  return markerRoot;
}

function createProbeLayoutMarkers(
  engine: WebGLEngine,
  scene: Scene,
  layout: ReturnType<typeof ProbeVolumeBaker.createRegionLayout>
): Entity {
  const markerRoot = scene.createRootEntity("probe_layout_preview");
  const markerMesh = PrimitiveMesh.createSphere(engine, 0.1, 12);
  const markerMaterial = createProbeMarkerMaterial(engine);
  const minimumProbeStep = layout.minBrickSize / (ProbeBrickProbeCountPerDimension - 1);
  const createdProbeKeys = new Set<string>();
  const localPosition = new Vector3();
  const worldPosition = new Vector3();
  const previewSH = new Float32Array(27);
  previewSH[0] = previewSH[1] = previewSH[2] = 0.55;

  for (const brick of layout.layouts) {
    const brickSize = layout.minBrickSize * Math.pow(ProbeBrickProbeCountPerDimension - 1, brick.subdivisionLevel);
    const probeStep = brickSize / (ProbeBrickProbeCountPerDimension - 1);
    for (let z = 0; z < ProbeBrickProbeCountPerDimension; z++) {
      for (let y = 0; y < ProbeBrickProbeCountPerDimension; y++) {
        for (let x = 0; x < ProbeBrickProbeCountPerDimension; x++) {
          localPosition.set(
            brick.position.x + x * probeStep,
            brick.position.y + y * probeStep,
            brick.position.z + z * probeStep
          );
          const key = `${Math.round(localPosition.x / minimumProbeStep)},${Math.round(
            localPosition.y / minimumProbeStep
          )},${Math.round(localPosition.z / minimumProbeStep)}`;
          if (createdProbeKeys.has(key)) {
            continue;
          }
          createdProbeKeys.add(key);

          Vector3.transformCoordinate(localPosition, layout.localToWorldMatrix, worldPosition);
          const marker = markerRoot.createChild("probe_preview");
          marker.transform.position.copyFrom(worldPosition);
          const renderer = marker.addComponent(MeshRenderer);
          renderer.mesh = markerMesh;
          renderer.setMaterial(markerMaterial);
          renderer.shaderData.setFloatArray(probeMarkerSHProperty, previewSH);
        }
      }
    }
  }
  return markerRoot;
}

function createProbeMarkerMaterial(engine: WebGLEngine): Material {
  const shader = Shader.find("Debug/ProbeMarker") ?? Shader.create(probeMarkerShaderSource);
  return new Material(engine, shader);
}

const probeMarkerShaderSource = `Shader "Debug/ProbeMarker" {
  SubShader "Default" {
    Pass "Forward" {
      struct Attributes {
        vec3 POSITION;
        vec3 NORMAL;
      };

      struct Varyings {
        vec3 normalWS;
      };

      mat4 renderer_MVPMat;
      mat4 renderer_NormalMat;
      vec3 renderer_ProbeSH[9];
      float scene_ProbeMarkerExposure;

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings output;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        output.normalWS = normalize((renderer_NormalMat * vec4(attr.NORMAL, 0.0)).xyz);
        return output;
      }

      vec4 frag(Varyings input) {
        vec3 normal = normalize(input.normalWS);
        vec3 irradiance = max(
          renderer_ProbeSH[0] * 0.886227 +
          renderer_ProbeSH[1] * (-1.023327 * normal.y) +
          renderer_ProbeSH[2] * ( 1.023327 * normal.z) +
          renderer_ProbeSH[3] * (-1.023327 * normal.x) +
          renderer_ProbeSH[4] * ( 0.858086 * normal.y * normal.x) +
          renderer_ProbeSH[5] * (-0.858086 * normal.y * normal.z) +
          renderer_ProbeSH[6] * ( 0.247708 * (3.0 * normal.z * normal.z - 1.0)) +
          renderer_ProbeSH[7] * (-0.858086 * normal.z * normal.x) +
          renderer_ProbeSH[8] * ( 0.429042 * (normal.x * normal.x - normal.y * normal.y)),
          vec3(0.0)
        );
        return vec4(irradiance * exp2(scene_ProbeMarkerExposure), 1.0);
      }
    }
  }
}`;

function createProbeDebug(
  region: ProbeVolumeRegion,
  controls: {
    showMarkers: boolean;
    probeExposure: number;
    sampling: string;
    projectMode: string;
    bakeSource: GlobalIlluminationBakePresetKey;
    availableScenarios: string;
    dayNightBlend: number;
    scenarioStatus: string;
    streamingStatus: string;
    residentChunks: string;
    residentProbeData: string;
    savedBakes: string;
    selectedBakeStatus: string;
    placement: string;
    maxSubdivisionLevel: number;
    bakeStatus: string;
    lightingPreset: string;
    ambientStatus: string;
    sunStatus: string;
    finalPreview: FinalLightingPreviewMode;
    finalLightingStatus: string;
    bakedLightingEnabled: boolean;
    refreshBakedLightingLabel: () => void;
    toggleBakedLighting: () => void;
    updateProbeExposure: (value: number) => void;
    updateFinalLightingPreview: (value: FinalLightingPreviewMode) => void;
    downloadLightingPreset: () => void;
    updateDayNightBlend: (value: number) => void;
    updateSampling: (value: string) => void;
    pinAllChunks: () => Promise<void>;
    updateBakeSource: (value: GlobalIlluminationBakePresetKey) => void;
    returnToRuntime: () => void;
    downloadScenarios: () => Promise<void>;
    bake: () => Promise<void>;
  },
  onMarkersChange: (visible: boolean) => void,
  onMarkerGridChange: () => void
): void {
  const gui = new dat.GUI();
  const folder = gui.addFolder("Probe");
  folder.add(controls, "showMarkers").onChange(onMarkersChange);
  folder.add(controls, "probeExposure", -5, 5, 0.1).name("Probe Exposure").onChange(controls.updateProbeExposure);
  folder.add(controls, "sampling", Object.keys(samplingModes)).name("Sampling").onChange(controls.updateSampling);

  const streamingFolder = folder.addFolder("Runtime Streaming");
  const streamingStatus = streamingFolder.add(controls, "streamingStatus").name("Status").listen();
  const residentChunks = streamingFolder.add(controls, "residentChunks").name("Chunks").listen();
  const residentProbeData = streamingFolder.add(controls, "residentProbeData").name("CPU Data").listen();
  streamingStatus.domElement.style.pointerEvents = "none";
  residentChunks.domElement.style.pointerEvents = "none";
  residentProbeData.domElement.style.pointerEvents = "none";
  if (!activeBakePreset) {
    streamingFolder.add(controls, "pinAllChunks").name("Pin All Chunks");
  }

  const scenarioFolder = folder.addFolder("Lighting Scenarios");
  const projectMode = scenarioFolder.add(controls, "projectMode").name("Project").listen();
  projectMode.domElement.style.pointerEvents = "none";
  const availableScenarios = scenarioFolder.add(controls, "availableScenarios").name("Available").listen();
  availableScenarios.domElement.style.pointerEvents = "none";
  if (!activeBakePreset) {
    scenarioFolder
      .add(controls, "dayNightBlend", 0, 1, 0.01)
      .name("Indirect Noon / Night")
      .listen()
      .onChange(controls.updateDayNightBlend);
  }
  const scenarioStatus = scenarioFolder.add(controls, "scenarioStatus").name("Status").listen();
  scenarioStatus.domElement.style.pointerEvents = "none";

  const bakeSourceFolder = folder.addFolder("Bake Sources");
  const bakeSourceOptions = Object.fromEntries(
    globalIlluminationBakePresetOrder.map((key) => [globalIlluminationBakePresets[key].label, key])
  );
  const savedBakes = bakeSourceFolder.add(controls, "savedBakes").name("Cached").listen();
  const selectedBakeStatus = bakeSourceFolder.add(controls, "selectedBakeStatus").name("Selected").listen();
  savedBakes.domElement.style.pointerEvents = "none";
  selectedBakeStatus.domElement.style.pointerEvents = "none";
  bakeSourceFolder.add(controls, "bakeSource", bakeSourceOptions).name("Time").onChange(controls.updateBakeSource);
  if (activeBakePreset) {
    bakeSourceFolder.add(controls, "returnToRuntime").name("Return to Runtime");
  }
  if (!activeBakePreset) {
    scenarioFolder.add(controls, "downloadScenarios").name("Download Scenarios");
  }

  let finalLightingFolder: dat.GUI | null = null;
  if (activeBakePreset) {
    finalLightingFolder = folder.addFolder("Final Lighting");
    const lightingPreset = finalLightingFolder.add(controls, "lightingPreset").name("Preset").listen();
    const ambientStatus = finalLightingFolder.add(controls, "ambientStatus").name("Ambient").listen();
    const sunStatus = finalLightingFolder.add(controls, "sunStatus").name("Sun").listen();
    const finalLightingStatus = finalLightingFolder.add(controls, "finalLightingStatus").name("Status").listen();
    lightingPreset.domElement.style.pointerEvents = "none";
    ambientStatus.domElement.style.pointerEvents = "none";
    sunStatus.domElement.style.pointerEvents = "none";
    finalLightingStatus.domElement.style.pointerEvents = "none";
    finalLightingFolder
      .add(controls, "finalPreview", finalLightingPreviewModes)
      .name("Preview")
      .listen()
      .onChange(controls.updateFinalLightingPreview);
    finalLightingFolder.add(controls, "downloadLightingPreset").name("Download Preset JSON");
  }

  const regionFolder = folder.addFolder("Region");
  const positionFolder = regionFolder.addFolder("Position");
  positionFolder.add(region.entity.transform.position, "x", -30, 30, 0.1).onChange(onMarkerGridChange);
  positionFolder.add(region.entity.transform.position, "y", -20, 20, 0.1).onChange(onMarkerGridChange);
  positionFolder.add(region.entity.transform.position, "z", -40, 10, 0.1).onChange(onMarkerGridChange);

  const rotationFolder = regionFolder.addFolder("Rotation");
  rotationFolder.add(region.entity.transform.rotation, "x", -180, 180, 1).onChange(onMarkerGridChange);
  rotationFolder.add(region.entity.transform.rotation, "y", -180, 180, 1).onChange(onMarkerGridChange);
  rotationFolder.add(region.entity.transform.rotation, "z", -180, 180, 1).onChange(onMarkerGridChange);

  const scaleFolder = regionFolder.addFolder("Scale");
  scaleFolder.add(region.entity.transform.scale, "x", 0.1, 4, 0.1).onChange(onMarkerGridChange);
  scaleFolder.add(region.entity.transform.scale, "y", 0.1, 4, 0.1).onChange(onMarkerGridChange);
  scaleFolder.add(region.entity.transform.scale, "z", 0.1, 4, 0.1).onChange(onMarkerGridChange);

  const sizeFolder = regionFolder.addFolder("Size");
  sizeFolder.add(region.size, "x", 1, 40, 1).onChange(onMarkerGridChange);
  sizeFolder.add(region.size, "y", 1, 40, 1).onChange(onMarkerGridChange);
  sizeFolder.add(region.size, "z", 1, 40, 1).onChange(onMarkerGridChange);
  regionFolder.add(region, "minBrickSize", 1, 12, 1).onChange(onMarkerGridChange);
  regionFolder.add(controls, "placement", ["Uniform", "Adaptive"]).name("Placement").onChange(onMarkerGridChange);
  regionFolder.add(controls, "maxSubdivisionLevel", 0, 3, 1).name("Max Subdivision").onChange(onMarkerGridChange);
  const bakeStatus = regionFolder.add(controls, "bakeStatus").name("Bake Status").listen();
  bakeStatus.domElement.style.pointerEvents = "none";
  regionFolder.add(controls, "bake").name(`Bake ${activeBakePreset?.label ?? "Noon"} + Layout`);
  if (!activeBakePreset) {
    const bakedLightingControl = {
      toggle: () => {
        controls.toggleBakedLighting();
        bakedLightingController.name(
          controls.bakedLightingEnabled ? "Disable Baked Lighting" : "Enable Baked Lighting"
        );
      }
    };
    const bakedLightingController = regionFolder.add(bakedLightingControl, "toggle");
    controls.refreshBakedLightingLabel = () => {
      bakedLightingController.name(controls.bakedLightingEnabled ? "Disable Baked Lighting" : "Enable Baked Lighting");
    };
    controls.refreshBakedLightingLabel();
  }

  positionFolder.open();
  rotationFolder.open();
  scaleFolder.open();
  sizeFolder.open();
  streamingFolder.open();
  scenarioFolder.open();
  bakeSourceFolder.open();
  finalLightingFolder?.open();
  regionFolder.open();
  folder.open();
}

const samplingModes: Record<string, ProbeVolumeSamplingMode> = {
  "Per Renderer": ProbeVolumeSamplingMode.PerRenderer,
  "Per Vertex": ProbeVolumeSamplingMode.PerVertex,
  "Per Fragment": ProbeVolumeSamplingMode.PerFragment
};

function isBakePresetKey(value: string | null): value is GlobalIlluminationBakePresetKey {
  return value !== null && globalIlluminationBakePresetOrder.includes(value as GlobalIlluminationBakePresetKey);
}
