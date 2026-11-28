/**
 * @title Day / Night System
 * @category Light
 */
import * as dat from "dat.gui";
import { Stats } from "@galacean/engine-toolkit-stats";
import {
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  DayNightClock,
  DayNightEnvironmentAdapter,
  DayNightMoonLighting,
  DayNightMoonPosition,
  DayNightProbeTimelineAdapter,
  DayNightProceduralSky,
  DayNightSolarPosition,
  DayNightSystem,
  DirectLight,
  FogMode,
  Logger,
  PostProcess,
  ProbeVolume,
  ProbeVolumeSamplingMode,
  RealtimeIBLBaker,
  Script,
  ShadowType,
  TonemappingEffect,
  TonemappingMode,
  WebGLEngine,
  createDayNightProfileFromLightingReference
} from "@galacean/engine";
import type { ProbeVolumeManifestJSON, Scene } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { FreeControl } from "@galacean/engine-animals/controls/FreeControl";
import { ProbeVolumeStreamingController } from "@galacean/engine-environment/gi/ProbeVolumeStreamingController";
import { globalIlluminationDayProjectUrl } from "@galacean/engine-environment/gi/projectSources";
import probeVolumeManifestUrl from "@galacean/engine-environment/gi/probe-volume-manifest.json?url";
import {
  PROCEDURAL_SKY_REALTIME_IBL_OPTIONS,
  PROCEDURAL_SKY_SOLAR_POSITION
} from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import { loadProjectWithoutBakedAmbient } from "@galacean/engine-project/project/loadProjectWithoutBakedAmbient";

class DayNightDriver extends Script {
  system!: DayNightSystem;
  ibl!: RealtimeIBLBaker;

  onUpdate(deltaTime: number): void {
    this.system.update(deltaTime);
    this.ibl.update();
  }
}

WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() }).then(async (engine) => {
  engine.canvas.setAutoResolution();
  engine.resourceManager.retryCount = 2;
  engine.run();

  try {
    const scene = await loadProjectWithoutBakedAmbient(engine, globalIlluminationDayProjectUrl);
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

    const postProcess =
      findEnabledComponent(scene, PostProcess) ?? scene.createRootEntity("DayNight Post").addComponent(PostProcess);
    postProcess.enabled = true;
    postProcess.entity.isActive = true;
    const tonemapping = postProcess.getEffect(TonemappingEffect) ?? postProcess.addEffect(TonemappingEffect)!;
    tonemapping.enabled = true;
    tonemapping.mode.value = TonemappingMode.Neutral;
    const bloom = postProcess.getEffect(BloomEffect) ?? postProcess.addEffect(BloomEffect)!;
    bloom.enabled = true;
    bloom.threshold.value = 0.8;
    bloom.intensity.value = 1;
    bloom.scatter.value = 0.7;
    const colorAdjustments =
      postProcess.getEffect(ColorAdjustmentsEffect) ?? postProcess.addEffect(ColorAdjustmentsEffect)!;
    colorAdjustments.enabled = true;

    const solarPosition = new DayNightSolarPosition(PROCEDURAL_SKY_SOLAR_POSITION);
    const moonPosition = new DayNightMoonPosition(PROCEDURAL_SKY_SOLAR_POSITION);
    const proceduralSky = new DayNightProceduralSky(scene, solarPosition, "DayNightProceduralSky");
    const moonLighting = new DayNightMoonLighting(scene, { entityName: "DayNight Moon" });
    const probeVolume = await installProbeStreaming(scene, camera);
    const profile = createDayNightProfileFromLightingReference(
      {
        sunIntensity: 1,
        sunColor: new Color(1, 1, 1, 1),
        shadowStrength: 1,
        ambientIntensity: 1,
        iblIntensity: 1,
        exposureCompensation: 0,
        bloomThreshold: 0.8,
        fogDensity: 0
      },
      solarPosition,
      moonPosition
    );
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
    const ibl = new RealtimeIBLBaker(scene, PROCEDURAL_SKY_REALTIME_IBL_OPTIONS);
    const environment = new DayNightEnvironmentAdapter(scene, {
      sun,
      sky: proceduralSky,
      moon: moonLighting,
      colorAdjustments,
      bloom,
      realtimeIBL: ibl,
      fogMode: FogMode.None
    });
    system.addConsumer(probeTimeline);
    system.addConsumer(environment);
    system.evaluate();
    const driver = camera.entity.addComponent(DayNightDriver);
    driver.system = system;
    driver.ibl = ibl;
    createControls(
      system,
      probeTimeline,
      ibl,
      sun,
      probeVolume,
      camera.entity.getComponent(ProbeVolumeStreamingController)!
    );
    window.addEventListener(
      "beforeunload",
      () => {
        driver.enabled = false;
        ibl.destroy();
        moonLighting.destroy();
        proceduralSky.destroy();
      },
      { once: true }
    );
  } catch (error) {
    Logger.error("day-night", error);
    console.error("day-night", error);
  }
});

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

function createControls(
  system: DayNightSystem,
  probeTimeline: DayNightProbeTimelineAdapter,
  ibl: RealtimeIBLBaker,
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
    iblSource: "procedural sky",
    iblStatus: formatIBLStatus(ibl),
    directElevation: `${directAngles.elevation.toFixed(1)}°`,
    directAzimuth: `${directAngles.azimuth.toFixed(1)}°`,
    probeStreaming: streaming.status,
    residentChunks: `${streaming.residentChunkCount}/${streaming.totalChunkCount}`,
    probeScenarios: probeVolume.lightingScenarioNames.join(", "),
    probeGPUPath: "6 scenarios / stable 2-slot GPU · no atlas rebuild",
    reflections: "Runtime SH + GGX cubemap",
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
    controls.iblStatus = formatIBLStatus(ibl);
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
  addReadOnly(consumersFolder, controls, "iblSource", "IBL Source");
  addReadOnly(consumersFolder, controls, "iblStatus", "IBL Bake");
  addReadOnly(consumersFolder, controls, "directElevation", "Direct Elevation");
  addReadOnly(consumersFolder, controls, "directAzimuth", "Direct Azimuth");
  addReadOnly(consumersFolder, controls, "reflections", "Reflections");
  addReadOnly(consumersFolder, controls, "probeStreaming", "Streaming");
  addReadOnly(consumersFolder, controls, "residentChunks", "Resident Chunks");

  clockFolder.open();
  stateFolder.open();
  consumersFolder.open();
}

function formatIBLStatus(ibl: RealtimeIBLBaker): string {
  const snapshot = ibl.getSnapshot();
  return `${snapshot.phase} · r${snapshot.publishedRevision} · ${Math.round(snapshot.progress * 100)}%`;
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
