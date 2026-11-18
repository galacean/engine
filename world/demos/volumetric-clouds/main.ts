import { Camera, Script, WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { Stats } from "@galacean/engine-toolkit-stats";
import { AssetAssemblySkyRuntime } from "@galacean/engine-world-planning/integrations/vegetation/AssetAssemblySkyRuntime";
import { createTreeAssemblyGrasslandsLighting } from "@galacean/engine-world-planning/integrations/vegetation/TreeAssemblyGrasslandsLighting";
import {
  INTEGRATED_WORLD_CAMERA_POSE,
  INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS,
  INTEGRATED_WORLD_RENDER_PIXEL_RATIO
} from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldLightingPreset";
import {
  TERRAIN_DEFAULT_CAMERA_CONFIGURATION,
  type TerrainLightingRuntime,
  type TerrainLightingRuntimeSnapshot
} from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import { FrameP95Stats } from "./src/FrameP95Stats.ts";
import { createIblMaterialReferenceChart } from "./src/IblMaterialReferenceChart.ts";

const UI_UPDATE_INTERVAL_SECONDS = 0.1;

interface ProceduralSkyApi {
  setTimeHours(timeHours: number): void;
  setPlaying(playing: boolean): void;
  setIBLBakingEnabled(enabled: boolean): void;
  getLightingSnapshot(): TerrainLightingRuntimeSnapshot;
  getIBLProfile(): ReturnType<TerrainLightingRuntime["getIBLProfile"]>;
  getSkySnapshot(): ReturnType<AssetAssemblySkyRuntime["getSnapshot"]>;
}

declare global {
  interface Window {
    proceduralSkyApi?: ProceduralSkyApi;
  }
}

class ProceduralSkyUiDriver extends Script {
  lighting!: TerrainLightingRuntime;
  private _elapsed = 0;

  override onUpdate(deltaTime: number): void {
    this._elapsed += deltaTime;
    if (this._elapsed < UI_UPDATE_INTERVAL_SECONDS) return;
    this._elapsed %= UI_UPDATE_INTERVAL_SECONDS;
    syncUi(this.lighting);
  }
}

let activeEngine: WebGLEngine | null = null;

void boot().catch((error: unknown) => {
  activeEngine?.destroy();
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  document.body.dataset.state = "error";
  required("loading", HTMLElement).textContent = `程序化天空启动失败：${message}`;
  console.error("[procedural-sky] startup failed", error);
});

async function boot(): Promise<void> {
  const canvas = required("canvas", HTMLCanvasElement);
  const engine = await WebGLEngine.create({
    canvas,
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  } as unknown as Parameters<typeof WebGLEngine.create>[0]);
  activeEngine = engine;

  const resize = (): void => {
    engine.canvas.setResolution(
      Math.max(1, Math.round(canvas.clientWidth * INTEGRATED_WORLD_RENDER_PIXEL_RATIO)),
      Math.max(1, Math.round(canvas.clientHeight * INTEGRATED_WORLD_RENDER_PIXEL_RATIO))
    );
  };
  resize();
  window.addEventListener("resize", resize);

  const scene = engine.sceneManager.activeScene!;
  const cameraEntity = scene.createRootEntity("Procedural Sky Camera");
  cameraEntity.transform.setPosition(...INTEGRATED_WORLD_CAMERA_POSE.position);
  cameraEntity.transform.setRotation(...INTEGRATED_WORLD_CAMERA_POSE.rotation);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.fieldOfView;
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.farClipPlane;
  camera.enableHDR = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.enableHDR;
  camera.enableFrustumCulling = false;

  const runtimeRoot = scene.createRootEntity("Procedural Sky Runtime");
  const { lighting, wind } = createTreeAssemblyGrasslandsLighting(scene, runtimeRoot, camera);
  // This isolated laboratory opts into timer-query diagnostics; product scenes keep them disabled.
  lighting.setIBLProfilingEnabled(true);
  lighting.setTuning({ playing: false, timeHours: INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS });

  const skyRuntime = await AssetAssemblySkyRuntime.create(scene, camera, lighting, wind, {
    materialName: "Procedural Sky Volumetric Clouds"
  });
  createIblMaterialReferenceChart(engine, cameraEntity);

  cameraEntity.addComponent(Stats);
  const uiDriver = cameraEntity.addComponent(ProceduralSkyUiDriver);
  uiDriver.lighting = lighting;
  cameraEntity.addComponent(FrameP95Stats);

  bindUi(canvas, cameraEntity, lighting);
  syncUi(lighting);
  engine.run();
  document.body.dataset.state = "ready";

  window.proceduralSkyApi = {
    setTimeHours: (timeHours: number) => {
      lighting.setTuning({ playing: false, timeHours });
      syncUi(lighting);
    },
    setPlaying: (playing: boolean) => {
      lighting.setTuning({ playing });
      syncUi(lighting);
    },
    setIBLBakingEnabled: (enabled: boolean) => lighting.setIBLBakingEnabled(enabled),
    getLightingSnapshot: () => lighting.getSnapshot(),
    getIBLProfile: () => lighting.getIBLProfile(),
    getSkySnapshot: () => skyRuntime.getSnapshot()
  };
}

function bindUi(canvas: HTMLCanvasElement, cameraEntity: Camera["entity"], lighting: TerrainLightingRuntime): void {
  required("time-presets", HTMLElement).addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-time-hours]");
    if (!button) return;
    lighting.setTuning({ playing: false, timeHours: Number(button.dataset.timeHours) });
    syncUi(lighting);
  });
  required("time", HTMLInputElement).addEventListener("input", (event) => {
    lighting.setTuning({ playing: false, timeHours: Number((event.target as HTMLInputElement).value) });
    syncUi(lighting);
  });
  required("time-toggle", HTMLButtonElement).addEventListener("click", () => {
    const snapshot = lighting.getSnapshot();
    lighting.setTuning({ playing: !snapshot.playing });
    syncUi(lighting);
  });
  required("panel-toggle", HTMLButtonElement).addEventListener("click", () => {
    setPanelsHidden(document.body.dataset.panelsHidden !== "true");
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key.toLowerCase() !== "h" ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isTextInput(event.target)
    ) {
      return;
    }
    event.preventDefault();
    setPanelsHidden(document.body.dataset.panelsHidden !== "true");
  });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pitch: number = INTEGRATED_WORLD_CAMERA_POSE.rotation[0];
  let yaw: number = INTEGRATED_WORLD_CAMERA_POSE.rotation[1];
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    yaw -= (event.clientX - lastX) * 0.12;
    pitch = Math.min(88, Math.max(-35, pitch - (event.clientY - lastY) * 0.12));
    lastX = event.clientX;
    lastY = event.clientY;
    cameraEntity.transform.setRotation(pitch, yaw, 0);
  });
  canvas.addEventListener("pointerup", () => {
    dragging = false;
  });
  canvas.addEventListener("pointercancel", () => {
    dragging = false;
  });
}

function syncUi(lighting: TerrainLightingRuntime): void {
  const snapshot = lighting.getSnapshot();
  const time = required("time", HTMLInputElement);
  const toggle = required("time-toggle", HTMLButtonElement);
  time.value = snapshot.timeHours.toFixed(2);
  required("time-value", HTMLOutputElement).value = formatTime(snapshot.timeHours);
  required("phase-value", HTMLElement).textContent = phaseLabel(snapshot.phase);
  toggle.setAttribute("aria-pressed", String(!snapshot.playing));
  toggle.textContent = snapshot.playing ? "暂停时间" : "继续时间";
  document
    .querySelectorAll<HTMLButtonElement>("button[data-time-hours]")
    .forEach((button) =>
      button.classList.toggle(
        "active",
        circularHourDistance(snapshot.timeHours, Number(button.dataset.timeHours)) < 0.1
      )
    );
}

function setPanelsHidden(hidden: boolean): void {
  document.body.dataset.panelsHidden = String(hidden);
  const toggle = required("panel-toggle", HTMLButtonElement);
  toggle.setAttribute("aria-pressed", String(hidden));
  toggle.setAttribute("aria-label", hidden ? "显示天空控制与性能面板" : "隐藏天空控制与性能面板");
  required("panel-toggle-label", HTMLElement).textContent = hidden ? "显示面板" : "隐藏面板";
}

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
  );
}

function formatTime(timeHours: number): string {
  const totalMinutes = Math.round((((timeHours % 24) + 24) % 24) * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function phaseLabel(phase: TerrainLightingRuntimeSnapshot["phase"]): string {
  switch (phase) {
    case "Day":
      return "白昼";
    case "Dawn":
      return "黎明";
    case "Dusk":
      return "黄昏";
    case "Night":
      return "夜晚";
  }
}

function circularHourDistance(left: number, right: number): number {
  const distance = Math.abs(left - right) % 24;
  return Math.min(distance, 24 - distance);
}

function required<T extends HTMLElement>(id: string, ctor: { new (...args: never[]): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) throw new Error(`Missing #${id}`);
  return element;
}
