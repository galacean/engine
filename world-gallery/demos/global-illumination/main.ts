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
  DirectLight,
  Keys,
  Logger,
  Material,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  PointLight,
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
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import type { Entity, Scene } from "@galacean/engine";
import probeVolumeUrl from "./light-probe-data.pvol?url";

const dayProjectUrl = "https://mdn.alipayobjects.com/oasis_be/afts/file/A*i5qfTbh8jfkAAAAAQYAAAAgAekp5AQ/project.json";
const nightProjectUrl =
  "https://mdn.alipayobjects.com/oasis_be/afts/file/A*yHxDTYCLl4sAAAAAQZAAAAgAekp5AQ/project.json";
const isNightBakeMode = new URLSearchParams(window.location.search).get("bake") === "night";
const projectUrl = isNightBakeMode ? nightProjectUrl : dayProjectUrl;
const dayScenario = "Day";
const nightScenario = "Night";
const probeMarkerSHProperty = ShaderProperty.getByName("renderer_ProbeSH");
const probeMarkerExposureProperty = ShaderProperty.getByName("scene_ProbeMarkerExposure");

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
      const scenarioBakeLighting = isNightBakeMode ? createNightBakeLighting(scene) : noScenarioBakeLighting;
      scenarioBakeLighting.apply(0);
      installFreeControl(scene);
      normalizeProbeDemoMaterials(engine, scene);
      return installLightProbe(engine, scene, scenarioBakeLighting);
    })
    .catch((error) => {
      Logger.error("light", error);
      console.error("light", error);
    });
});

interface ScenarioBakeLighting {
  apply(factor: number): void;
}

function createNightBakeLighting(scene: Scene): ScenarioBakeLighting {
  const lights: DirectLight[] = [];
  const pointLights: PointLight[] = [];
  const nightEmitterEntities = scene.rootEntities.filter((entity) => entity.name === "Sphere");
  for (const root of scene.rootEntities) {
    const rootLights: DirectLight[] = [];
    const rootPointLights: PointLight[] = [];
    root.getComponentsIncludeChildren(DirectLight, rootLights);
    root.getComponentsIncludeChildren(PointLight, rootPointLights);
    lights.push(...rootLights);
    pointLights.push(...rootPointLights);
  }

  const sun = scene.sun ?? lights.find((candidate) => candidate.enabled);
  if (!sun) {
    throw new Error("The lighting scenario demo requires an enabled directional light.");
  }

  const daySunTint = [1, 0.9254901960784314, 0.8784313725490196] as const;
  const daySunBrightness = (Math.max(...daySunTint) + Math.min(...daySunTint)) * 0.5;
  const daySunScale = 5 / daySunBrightness;
  const daySun = daySunTint.map((value) => value * daySunScale);
  const nightSun = [sun.color.r, sun.color.g, sun.color.b];
  const nightPointLights = pointLights.map((light) => ({
    light,
    color: [light.color.r, light.color.g, light.color.b] as const
  }));

  return {
    apply(factor: number): void {
      factor = Math.max(0, Math.min(1, factor));
      sun.color.set(
        lerp(daySun[0], nightSun[0], factor),
        lerp(daySun[1], nightSun[1], factor),
        lerp(daySun[2], nightSun[2], factor),
        sun.color.a
      );
      for (const { light, color } of nightPointLights) {
        light.color.set(color[0] * factor, color[1] * factor, color[2] * factor, light.color.a);
      }
      for (const entity of nightEmitterEntities) {
        entity.isActive = factor === 1;
      }
    }
  };
}

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

async function installLightProbe(
  engine: WebGLEngine,
  scene: Scene,
  scenarioBakeLighting: ScenarioBakeLighting
): Promise<void> {
  const camera = scene.rootEntities
    .map((entity) => entity.getComponent(Camera))
    .find((component): component is Camera => Boolean(component?.enabled));
  if (!camera) {
    throw new Error("The probe demo requires an enabled scene camera.");
  }
  const regionEntity = scene.createRootEntity("probe_volume_region");
  const region = regionEntity.addComponent(ProbeVolumeRegion);
  region.size.set(32, 14, 20);
  const probeArtifact = await fetch(probeVolumeUrl).then((response) => response.arrayBuffer());
  let probeVolume = ProbeVolumeBinary.decode(probeArtifact);
  if (!probeVolume.lightingScenarioNames.includes(dayScenario)) {
    probeVolume.renameLightingScenario(probeVolume.lightingScenario, dayScenario);
  }
  probeVolume.lightingScenario = dayScenario;
  region.minBrickSize = Math.max(probeVolume.minBrickSize, 8);
  fitProbeRegionToScene(scene, region);

  probeVolume.samplingMode = ProbeVolumeSamplingMode.PerFragment;
  updateProbeVolumeTransform(region, probeVolume);
  scene.shaderData.setFloat(probeMarkerExposureProperty, 0);
  let markerRoot = createProbeMarkers(engine, scene, probeVolume);
  let bakedLightingEnabled = true;
  let isBaking = false;
  let previewRequest = 0;
  const updateAvailableScenarios = (): string => probeVolume.lightingScenarioNames.join(", ");
  const controls = {
    showMarkers: false,
    probeExposure: 0,
    sampling: "Per Fragment",
    projectMode: isNightBakeMode ? "Night Bake Source" : "Day View + Tonemapping + Bloom",
    availableScenarios: updateAvailableScenarios(),
    dayNightBlend: 0,
    scenarioStatus: probeVolume.lightingScenarioNames.includes(nightScenario)
      ? "Day and Night loaded"
      : "Bake Night to enable blending",
    placement: "Uniform",
    maxSubdivisionLevel: 1,
    bakeStatus: "Loaded",
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
    bakeNightScenario: async () => {
      if (!isNightBakeMode) {
        controls.scenarioStatus = "Open Night Bake Source before baking Night";
        return;
      }
      if (isBaking) {
        return;
      }
      isBaking = true;
      const previousBlend = controls.dayNightBlend;
      controls.scenarioStatus = "Preparing Night bake";
      scenarioBakeLighting.apply(1);
      try {
        await ProbeVolumeBaker.bakeLightingScenario(scene, probeVolume, nightScenario, {
          camera,
          resolution: 8,
          nearClipPlane: 0.05,
          farClipPlane: 60,
          bounceCount: 2,
          indirectIntensity: 2,
          separateEnvironment: false,
          bakeSunIndirect: true,
          probesPerBatch: 1,
          onProgress: ({ completedProbes, totalProbes, bounce, bounceCount }) => {
            const percentage = totalProbes > 0 ? Math.round((completedProbes / totalProbes) * 100) : 0;
            controls.scenarioStatus = `${completedProbes}/${totalProbes} (${percentage}%) - Bounce ${bounce}/${bounceCount}`;
          }
        });
        controls.availableScenarios = updateAvailableScenarios();
        controls.scenarioStatus = "Night baked; drag Day / Night Blend";
        controls.updateDayNightBlend(previousBlend);
        downloadProbeVolumeArtifact(probeVolume);
      } catch (error) {
        controls.scenarioStatus = `Failed: ${error instanceof Error ? error.message : String(error)}`;
        Logger.error("night scenario bake", error);
        console.error("night scenario bake", error);
      } finally {
        scenarioBakeLighting.apply(0);
        isBaking = false;
        camera.render();
      }
    },
    openNightBakeScene: () => {
      const url = new URL(window.location.href);
      url.searchParams.set("bake", "night");
      window.location.href = url.toString();
    },
    returnToDayView: () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("bake");
      window.location.href = url.toString();
    },
    downloadScenarios: () => {
      downloadProbeVolumeArtifact(probeVolume);
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
      controls.bakeStatus = "Preparing";
      const previousVolume = probeVolume;
      markerRoot.destroy();
      scenarioBakeLighting.apply(0);
      try {
        probeVolume = await ProbeVolumeBaker.bakeRegion(scene, region, {
          lightingScenario: dayScenario,
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
        markerRoot = createProbeMarkers(engine, scene, probeVolume);
        markerRoot.isActive = controls.showMarkers;
        scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
        controls.dayNightBlend = 0;
        controls.availableScenarios = updateAvailableScenarios();
        controls.scenarioStatus = "Day baked; bake Night to enable blending";
        downloadProbeVolumeArtifact(probeVolume);
        previousVolume.dispose();
        controls.bakeStatus = "Completed";
        camera.render();
      } catch (error) {
        probeVolume = previousVolume;
        controls.updateDayNightBlend(controls.dayNightBlend);
        markerRoot = createProbeMarkers(engine, scene, probeVolume);
        markerRoot.isActive = controls.showMarkers;
        scene.environmentLighting.probeVolume = bakedLightingEnabled ? probeVolume : undefined;
        controls.bakeStatus = `Failed: ${error instanceof Error ? error.message : String(error)}`;
        Logger.error("probe bake", error);
        console.error("probe bake", error);
      } finally {
        isBaking = false;
      }
    }
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

  scene.environmentLighting.probeVolume = probeVolume;
  scene.environmentLighting.probeVolumeAnchor = camera.entity.transform;
  camera.render();
  createProbeDebug(
    region,
    controls,
    (visible) => {
      markerRoot.isActive = visible;
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

function downloadProbeVolumeArtifact(volume: ProbeVolume): void {
  const url = URL.createObjectURL(new Blob([ProbeVolumeBinary.encode(volume)], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "probe-volume.pvol";
  anchor.click();
  URL.revokeObjectURL(url);
}

function updateProbeVolumeTransform(region: ProbeVolumeRegion, volume: ProbeVolume): void {
  const sourceMin = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const sourceMax = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (let i = 0; i < volume.bricks.length; i++) {
    const brick = volume.bricks[i];
    const brickSize = volume.minBrickSize * Math.pow(3, brick.subdivisionLevel);
    sourceMin.x = Math.min(sourceMin.x, brick.position.x);
    sourceMin.y = Math.min(sourceMin.y, brick.position.y);
    sourceMin.z = Math.min(sourceMin.z, brick.position.z);
    sourceMax.x = Math.max(sourceMax.x, brick.position.x + brickSize);
    sourceMax.y = Math.max(sourceMax.y, brick.position.y + brickSize);
    sourceMax.z = Math.max(sourceMax.z, brick.position.z + brickSize);
  }

  const scaleX = region.size.x / (sourceMax.x - sourceMin.x);
  const scaleY = region.size.y / (sourceMax.y - sourceMin.y);
  const scaleZ = region.size.z / (sourceMax.z - sourceMin.z);
  const gridToRegion = new Matrix(
    scaleX,
    0,
    0,
    0,
    0,
    scaleY,
    0,
    0,
    0,
    0,
    scaleZ,
    0,
    -region.size.x * 0.5 - sourceMin.x * scaleX,
    -region.size.y * 0.5 - sourceMin.y * scaleY,
    -region.size.z * 0.5 - sourceMin.z * scaleZ,
    1
  );
  const localToWorld = new Matrix();
  Matrix.multiply(region.entity.transform.worldMatrix, gridToRegion, localToWorld);
  volume.localToWorldMatrix = localToWorld;
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
    availableScenarios: string;
    dayNightBlend: number;
    scenarioStatus: string;
    placement: string;
    maxSubdivisionLevel: number;
    bakeStatus: string;
    bakedLightingEnabled: boolean;
    toggleBakedLighting: () => void;
    updateProbeExposure: (value: number) => void;
    updateDayNightBlend: (value: number) => void;
    updateSampling: (value: string) => void;
    bakeNightScenario: () => Promise<void>;
    openNightBakeScene: () => void;
    returnToDayView: () => void;
    downloadScenarios: () => void;
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

  const scenarioFolder = folder.addFolder("Lighting Scenarios");
  const projectMode = scenarioFolder.add(controls, "projectMode").name("Project").listen();
  projectMode.domElement.style.pointerEvents = "none";
  const availableScenarios = scenarioFolder.add(controls, "availableScenarios").name("Available").listen();
  availableScenarios.domElement.style.pointerEvents = "none";
  scenarioFolder
    .add(controls, "dayNightBlend", 0, 1, 0.01)
    .name("Indirect Day / Night")
    .listen()
    .onChange(controls.updateDayNightBlend);
  const scenarioStatus = scenarioFolder.add(controls, "scenarioStatus").name("Status").listen();
  scenarioStatus.domElement.style.pointerEvents = "none";
  if (isNightBakeMode) {
    scenarioFolder.add(controls, "bakeNightScenario").name("Bake Night Scenario");
    scenarioFolder.add(controls, "returnToDayView").name("Return to Day View");
  } else {
    scenarioFolder.add(controls, "openNightBakeScene").name("Open Night Bake Source");
  }
  scenarioFolder.add(controls, "downloadScenarios").name("Download Scenarios");

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
  regionFolder.add(controls, "bake").name("Bake Day + Layout");
  const bakedLightingControl = {
    toggle: () => {
      controls.toggleBakedLighting();
      bakedLightingController.name(controls.bakedLightingEnabled ? "Disable Baked Lighting" : "Enable Baked Lighting");
    }
  };
  const bakedLightingController = regionFolder.add(bakedLightingControl, "toggle").name("Disable Baked Lighting");

  positionFolder.open();
  rotationFolder.open();
  scaleFolder.open();
  sizeFolder.open();
  scenarioFolder.open();
  regionFolder.open();
  folder.open();
}

const samplingModes: Record<string, ProbeVolumeSamplingMode> = {
  "Per Renderer": ProbeVolumeSamplingMode.PerRenderer,
  "Per Vertex": ProbeVolumeSamplingMode.PerVertex,
  "Per Fragment": ProbeVolumeSamplingMode.PerFragment
};

function lerp(from: number, to: number, factor: number): number {
  return from + (to - from) * factor;
}

const noScenarioBakeLighting: ScenarioBakeLighting = {
  apply(): void {}
};
