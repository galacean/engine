/**
 * @title Day / Night System
 * @category Light
 */
import * as dat from "dat.gui";
import { FreeControl } from "@galacean/engine-toolkit-controls";
import { Stats } from "@galacean/engine-toolkit-stats";
import {
  AssetType,
  BlinnPhongMaterial,
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  DayNightClock,
  DayNightColorGradient,
  DayNightCurve,
  DayNightEnvironmentAdapter,
  DayNightLightingAdapter,
  DayNightLightingScenarioAdapter,
  DayNightPostProcessFogAdapter,
  DayNightProbeTimelineAdapter,
  DayNightProfile,
  DayNightSystem,
  DirectLight,
  FogMode,
  Logger,
  PBRMaterial,
  PostProcess,
  ProbeVolume,
  ProbeVolumeSamplingMode,
  Renderer,
  Script,
  ShadowType,
  SphericalHarmonics3,
  TonemappingEffect,
  TonemappingMode,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import type { ProbeVolumeManifestJSON, Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ProbeVolumeStreamingController } from "../global-illumination/ProbeVolumeStreamingController";
import { globalIlluminationDayProjectUrl } from "../global-illumination/projectSources";
import probeVolumeManifestUrl from "../global-illumination/probe-volume-manifest.json?url";
import { galleryLightingScenarioPresets } from "./lightingScenarioPresets";

class DayNightDriver extends Script {
  system!: DayNightSystem;

  onUpdate(deltaTime: number): void {
    this.system.update(deltaTime);
  }
}

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.resizeByClientSize();
  engine.resourceManager.retryCount = 2;
  window.addEventListener("resize", () => engine.canvas.resizeByClientSize());
  engine.run();

  try {
    await engine.resourceManager.load({
      type: AssetType.Project,
      url: globalIlluminationDayProjectUrl
    });
    const scene = engine.sceneManager.activeScene;
    const camera = findEnabledComponent(scene, Camera);
    const sun = scene.sun ?? findEnabledComponent(scene, DirectLight);
    if (!camera || !sun) {
      throw new Error("Day / Night demo requires the source camera and directional light.");
    }
    scene.sun = sun;
    sun.shadowType = ShadowType.SoftLow;
    camera.enableHDR = true;
    camera.enablePostProcess = true;

    installCameraControls(camera);
    disableSceneReflections(scene);

    const postProcess =
      findEnabledComponent(scene, PostProcess) ?? scene.createRootEntity("DayNight Post").addComponent(PostProcess);
    postProcess.enabled = true;
    postProcess.entity.isActive = true;
    const tonemapping = postProcess.getEffect(TonemappingEffect) ?? postProcess.addEffect(TonemappingEffect);
    tonemapping.enabled = true;
    tonemapping.mode.value = TonemappingMode.Neutral;
    const bloom = postProcess.getEffect(BloomEffect) ?? postProcess.addEffect(BloomEffect);
    bloom.enabled = true;
    bloom.threshold.value = 0.8;
    bloom.intensity.value = 1;
    bloom.scatter.value = 0.7;
    const colorAdjustments =
      postProcess.getEffect(ColorAdjustmentsEffect) ?? postProcess.addEffect(ColorAdjustmentsEffect);
    colorAdjustments.enabled = true;

    const probeVolume = await installProbeStreaming(scene, camera);
    const profile = createGalleryProfile();
    const system = new DayNightSystem(new DayNightClock(16.5), profile);
    system.updateFrequency = 60;
    system.clock.timeScale = 7200;

    const probeTimeline = new DayNightProbeTimelineAdapter(scene.environmentLighting, [
      { timeHours: 0, scenario: "Night" },
      { timeHours: 6, scenario: "Dawn" },
      { timeHours: 9, scenario: "Morning" },
      { timeHours: 12, scenario: "Noon" },
      { timeHours: 15, scenario: "Afternoon" },
      { timeHours: 18, scenario: "Dusk" }
    ]);
    system.addConsumer(probeTimeline);
    system.addConsumer(new DayNightEnvironmentAdapter(scene));
    system.addConsumer(new DayNightLightingAdapter(sun));
    const lightingTimeline = new DayNightLightingScenarioAdapter(sun, scene.ambientLight, createLightingScenarioKeys());
    lightingTimeline.applyDirectLight = false;
    system.addConsumer(lightingTimeline);
    const postProcessFog = new DayNightPostProcessFogAdapter(scene, colorAdjustments, bloom);
    postProcessFog.fogMode = FogMode.None;
    system.addConsumer(postProcessFog);

    const driver = camera.entity.addComponent(DayNightDriver);
    driver.system = system;
    system.evaluate();
    createControls(
      system,
      probeTimeline,
      lightingTimeline,
      sun,
      probeVolume,
      camera.entity.getComponent(ProbeVolumeStreamingController)!
    );
  } catch (error) {
    Logger.error("day-night", error);
    console.error("day-night", error);
  }
});

function createGalleryProfile(): DayNightProfile {
  const profile = new DayNightProfile();
  const solarPresets = galleryLightingScenarioPresets.filter(({ scenario }) => scenario !== "Night");
  profile.sunElevation = new DayNightCurve(
    [
      { time: 0, value: -40 },
      ...solarPresets.map(({ timeHours, sunRotation }) => ({
        time: timeHours / 24,
        value: -sunRotation[0]
      })),
      { time: 1, value: -40 }
    ],
    "MonotoneCubic"
  );
  profile.sunAzimuth = new DayNightCurve(
    [
      { time: 0, value: -45 },
      ...solarPresets.map(({ timeHours, sunRotation }) => ({
        time: timeHours / 24,
        value: sunRotation[1] < 0 ? sunRotation[1] + 360 : sunRotation[1]
      })),
      { time: 1, value: 315 }
    ],
    "MonotoneCubic"
  );
  profile.sunIntensity = new DayNightCurve(
    [
      { time: 0, value: 0 },
      ...solarPresets.map(({ timeHours, sunColor }) => ({
        time: timeHours / 24,
        value: Math.max(sunColor[0], sunColor[1], sunColor[2])
      })),
      { time: 1, value: 0 }
    ],
    "MonotoneCubic"
  );
  profile.sunColor = new DayNightColorGradient([
    { time: 0, color: new Color(0.18, 0.22, 0.32, 1) },
    ...solarPresets.map(({ timeHours, sunColor }) => {
      const intensity = Math.max(sunColor[0], sunColor[1], sunColor[2]);
      return {
        time: timeHours / 24,
        color: new Color(sunColor[0] / intensity, sunColor[1] / intensity, sunColor[2] / intensity, 1)
      };
    }),
    { time: 1, color: new Color(0.18, 0.22, 0.32, 1) }
  ]);
  profile.shadowStrength = new DayNightCurve(
    [
      ...galleryLightingScenarioPresets.map(({ timeHours, shadowStrength }) => ({
        time: timeHours / 24,
        value: shadowStrength
      })),
      { time: 1, value: galleryLightingScenarioPresets[0].shadowStrength }
    ],
    "MonotoneCubic"
  );
  profile.ambientIntensity = new DayNightCurve([
    { time: 0, value: 1 },
    { time: 1, value: 1 }
  ]);
  profile.iblIntensity = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 1, value: 0 }
  ]);
  profile.fogDensity = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 1, value: 0 }
  ]);
  profile.skyExposure = new DayNightCurve([
    { time: 0, value: 1 },
    { time: 1, value: 1 }
  ]);
  profile.exposureCompensation = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 1, value: 0 }
  ]);
  profile.whiteBalanceTemperature = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 1, value: 0 }
  ]);
  profile.whiteBalanceTint = new DayNightCurve([
    { time: 0, value: 0 },
    { time: 1, value: 0 }
  ]);
  profile.bloomThreshold = new DayNightCurve([
    { time: 0, value: 0.8 },
    { time: 1, value: 0.8 }
  ]);
  return profile;
}

function createLightingScenarioKeys() {
  return galleryLightingScenarioPresets.map((preset) => {
    const ambientSH = new SphericalHarmonics3();
    ambientSH.copyFromArray(preset.ambientSH);
    return {
      timeHours: preset.timeHours,
      scenario: preset.scenario,
      sunRotation: new Vector3(...preset.sunRotation),
      sunColor: new Color(...preset.sunColor, 1),
      shadowStrength: preset.shadowStrength,
      diffuseSphericalHarmonics: ambientSH,
      diffuseIntensity: preset.ambientIntensity,
      specularIntensity: 0
    };
  });
}

async function installProbeStreaming(scene: Scene, camera: Camera): Promise<ProbeVolume> {
  const manifest = await fetch(probeVolumeManifestUrl).then(
    (response) => response.json() as Promise<ProbeVolumeManifestJSON>
  );
  const volume = ProbeVolume.fromManifestJSON(manifest);
  volume.samplingMode = ProbeVolumeSamplingMode.PerVertex;
  scene.environmentLighting.probeVolume = volume;
  scene.environmentLighting.probeVolumeAnchor = camera.entity.transform;

  const streaming = camera.entity.addComponent(ProbeVolumeStreamingController);
  await streaming.initialize(volume, probeVolumeManifestUrl);
  return volume;
}

function installCameraControls(camera: Camera): void {
  const control = camera.entity.getComponent(FreeControl) ?? camera.entity.addComponent(FreeControl);
  control.movementSpeed = 3;
  control.floorMock = false;
  camera.entity.getComponent(Stats) ?? camera.entity.addComponent(Stats);
}

function disableSceneReflections(scene: Scene): void {
  const ambient = scene.ambientLight;
  ambient.specularIntensity = 0;
  ambient.secondarySpecularTexture = null;

  const processedMaterials = new Set<object>();
  for (const root of scene.rootEntities) {
    const renderers: Renderer[] = [];
    root.getComponentsIncludeChildren(Renderer, renderers);
    for (const renderer of renderers) {
      for (const material of renderer.getMaterials()) {
        if (!material || processedMaterials.has(material)) {
          continue;
        }
        processedMaterials.add(material);
        if (material instanceof PBRMaterial) {
          material.metallic = 0;
          material.roughness = 1;
          material.specularIntensity = 0;
          material.clearCoat = 0;
          material.iridescence = 0;
          material.sheenColor.set(0, 0, 0, 1);
        } else if (material instanceof BlinnPhongMaterial) {
          material.specularColor.set(0, 0, 0, 1);
        }
      }
    }
  }
}

function createControls(
  system: DayNightSystem,
  probeTimeline: DayNightProbeTimelineAdapter,
  lightingTimeline: DayNightLightingScenarioAdapter,
  sun: DirectLight,
  probeVolume: ProbeVolume,
  streaming: ProbeVolumeStreamingController
): void {
  const directAngles = { elevation: 0, azimuth: 0 };
  updateDirectLightAngles(sun, directAngles);
  const controls = {
    time: system.clock.timeHours,
    playing: !system.clock.paused,
    timeScale: system.clock.timeScale,
    phase: system.state.phase,
    sunElevation: `${system.state.sunElevation.toFixed(1)}°`,
    sunAzimuth: `${system.state.sunAzimuth.toFixed(1)}°`,
    nightFactor: system.state.nightFactor,
    environmentBlend: system.state.environmentBlend,
    exposureEV: system.state.exposureCompensation,
    probeActive: probeTimeline.activeScenario,
    probeTarget: probeTimeline.targetScenario,
    probeBlend: probeTimeline.blendFactor,
    lightingActive: lightingTimeline.activeScenario,
    lightingTarget: lightingTimeline.targetScenario,
    lightingBlend: lightingTimeline.blendFactor,
    directElevation: `${directAngles.elevation.toFixed(1)}°`,
    directAzimuth: `${directAngles.azimuth.toFixed(1)}°`,
    probeStreaming: streaming.status,
    residentChunks: `${streaming.residentChunkCount}/${streaming.totalChunkCount}`,
    probeScenarios: probeVolume.lightingScenarioNames.join(", "),
    probeGPUPath: "6 scenarios / stable 2-slot GPU · no atlas rebuild",
    reflections: "Disabled (IBL + material specular)",
    dawn: () => system.setTimeHours(6),
    morning: () => system.setTimeHours(9),
    noon: () => system.setTimeHours(12),
    afternoon: () => system.setTimeHours(15),
    dusk: () => system.setTimeHours(18),
    midnight: () => system.setTimeHours(0)
  };

  system.stateChanged.on((state) => {
    controls.time = system.clock.timeHours;
    controls.phase = state.phase;
    controls.sunElevation = `${state.sunElevation.toFixed(1)}°`;
    controls.sunAzimuth = `${state.sunAzimuth.toFixed(1)}°`;
    controls.nightFactor = state.nightFactor;
    controls.environmentBlend = state.environmentBlend;
    controls.exposureEV = state.exposureCompensation;
    controls.probeActive = probeTimeline.activeScenario;
    controls.probeTarget = probeTimeline.targetScenario;
    controls.probeBlend = probeTimeline.blendFactor;
    controls.lightingActive = lightingTimeline.activeScenario;
    controls.lightingTarget = lightingTimeline.targetScenario;
    controls.lightingBlend = lightingTimeline.blendFactor;
    updateDirectLightAngles(sun, directAngles);
    controls.directElevation = `${directAngles.elevation.toFixed(1)}°`;
    controls.directAzimuth = `${directAngles.azimuth.toFixed(1)}°`;
    controls.probeStreaming = streaming.status;
    controls.residentChunks = `${streaming.residentChunkCount}/${streaming.totalChunkCount}`;
  });
  streaming.onResidencyChanged = () => {
    controls.probeStreaming = streaming.status;
    controls.residentChunks = `${streaming.residentChunkCount}/${streaming.totalChunkCount}`;
  };

  const gui = new dat.GUI({ width: 355 });
  const clockFolder = gui.addFolder("DayNightClock");
  clockFolder
    .add(controls, "time", 0, 24, 0.01)
    .name("Time (hours)")
    .listen()
    .onChange((value: number) => system.setTimeHours(value));
  clockFolder
    .add(controls, "playing")
    .name("Play")
    .onChange((value: boolean) => (system.clock.paused = !value));
  clockFolder
    .add(controls, "timeScale", 0, 7200, 10)
    .name("Sim sec / real sec")
    .onChange((value: number) => (system.clock.timeScale = value));
  clockFolder.add(system, "updateFrequency", 1, 60, 1).name("State Hz");
  clockFolder.add(controls, "dawn").name("Jump Dawn");
  clockFolder.add(controls, "morning").name("Jump Morning");
  clockFolder.add(controls, "noon").name("Jump Noon");
  clockFolder.add(controls, "afternoon").name("Jump Afternoon");
  clockFolder.add(controls, "dusk").name("Jump Dusk");
  clockFolder.add(controls, "midnight").name("Jump Midnight");

  const stateFolder = gui.addFolder("Produced DayNightState");
  addReadOnly(stateFolder, controls, "phase", "Phase");
  addReadOnly(stateFolder, controls, "sunElevation", "State Elevation");
  addReadOnly(stateFolder, controls, "sunAzimuth", "State Azimuth");
  stateFolder.add(controls, "nightFactor", 0, 1, 0.001).name("Night Factor").listen();
  stateFolder.add(controls, "environmentBlend", 0, 1, 0.001).name("Environment Blend").listen();
  stateFolder.add(controls, "exposureEV", -2, 2, 0.01).name("Exposure EV").listen();

  const consumersFolder = gui.addFolder("Consumers");
  addReadOnly(consumersFolder, controls, "probeGPUPath", "Probe");
  addReadOnly(consumersFolder, controls, "probeScenarios", "Available");
  addReadOnly(consumersFolder, controls, "probeActive", "Probe Active");
  addReadOnly(consumersFolder, controls, "probeTarget", "Probe Target");
  consumersFolder.add(controls, "probeBlend", 0, 1, 0.001).name("Probe GPU Blend").listen();
  addReadOnly(consumersFolder, controls, "lightingActive", "Lighting Active");
  addReadOnly(consumersFolder, controls, "lightingTarget", "Lighting Target");
  consumersFolder.add(controls, "lightingBlend", 0, 1, 0.001).name("Lighting Blend").listen();
  addReadOnly(consumersFolder, controls, "directElevation", "Direct Elevation");
  addReadOnly(consumersFolder, controls, "directAzimuth", "Direct Azimuth");
  addReadOnly(consumersFolder, controls, "reflections", "Reflections");
  addReadOnly(consumersFolder, controls, "probeStreaming", "Streaming");
  addReadOnly(consumersFolder, controls, "residentChunks", "Resident Chunks");

  clockFolder.open();
  stateFolder.open();
  consumersFolder.open();
}

function updateDirectLightAngles(light: DirectLight, out: { elevation: number; azimuth: number }): void {
  const direction = light.direction;
  out.elevation = (Math.asin(Math.max(-1, Math.min(1, -direction.y))) * 180) / Math.PI;
  const azimuth = (Math.atan2(-direction.x, -direction.z) * 180) / Math.PI;
  out.azimuth = ((azimuth % 360) + 360) % 360;
}

function addReadOnly(
  folder: dat.GUI,
  target: Record<string, unknown>,
  property: string,
  label: string
): dat.GUIController {
  const controller = folder.add(target, property).name(label).listen();
  controller.domElement.style.pointerEvents = "none";
  return controller;
}

function findEnabledComponent<T>(scene: Scene, type: new (...args: any[]) => T): T | undefined {
  for (const root of scene.rootEntities) {
    const components: T[] = [];
    root.getComponentsIncludeChildren(type as never, components as never);
    const enabled = components.find(
      (component) => !("enabled" in (component as object)) || (component as { enabled: boolean }).enabled
    );
    if (enabled) {
      return enabled;
    }
  }
  return undefined;
}
