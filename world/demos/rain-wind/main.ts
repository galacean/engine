import {
  Camera,
  Color,
  DirectLight,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Script,
  Vector3,
  WebGLEngine,
  type Engine,
  type Entity
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  TerrainPrecipitationVfx,
  type TerrainPrecipitationVfxSnapshot
} from "@galacean/engine-world-planning/integrations/terrain/environment/TerrainPrecipitationVfx";
import { resolveWindRelaxedDisplacement } from "@galacean/engine-environment/terrain/environment/TerrainPrecipitationTrajectory";
import type {
  TerrainRainImpactClimate,
  TerrainRainImpactSample,
  TerrainRainImpactSurfaceProvider
} from "@galacean/engine-world-planning/integrations/terrain/environment/TerrainRainImpactSurface";

type RainWindCameraPreset = "overview" | "side" | "ground";

interface RainWindCameraState {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

export interface RainWindLabDiagnostics {
  readonly ready: true;
  readonly paused: boolean;
  readonly windSpeedMps: number;
  readonly rainRate: number;
  readonly rainTurbulence: number;
  readonly snowRate: 0;
  readonly representativeAgeSeconds: number;
  readonly representativeHorizontalDisplacementMeters: number;
  readonly representativeTiltDegrees: number;
  readonly precipitation: TerrainPrecipitationVfxSnapshot;
}

export interface RainWindLabApi {
  readonly ready: true;
  getDiagnostics(): RainWindLabDiagnostics;
  setWindSpeed(speedMps: number): RainWindLabDiagnostics;
  reverseWind(): RainWindLabDiagnostics;
  setRainRate(rate: number): RainWindLabDiagnostics;
  setRainTurbulence(turbulence: number): RainWindLabDiagnostics;
  setPaused(paused: boolean): RainWindLabDiagnostics;
  setCamera(preset: RainWindCameraPreset): RainWindLabDiagnostics;
}

declare global {
  interface Window {
    rainWindLab?: RainWindLabApi;
    rainWindLabReady?: Promise<RainWindLabApi>;
    rainWindLabError?: string;
  }
}

const INITIAL_WIND_SPEED_MPS = 110;
const INITIAL_RAIN_RATE = 1;
const INITIAL_RAIN_TURBULENCE = 0.15;
const RAIN_RESPONSE_TIME_SECONDS = 0.2;
const REPRESENTATIVE_RAIN_AGE_SECONDS = 0.5;
const REPRESENTATIVE_VERTICAL_SPEED_MPS = 60;
const WIND_PRESETS = [0, 12, 22, 37, 48, 60, 75, 90, 110] as const;
const CAMERA_PRESETS: Readonly<Record<RainWindCameraPreset, RainWindCameraState>> = Object.freeze({
  overview: { position: [0, 8.2, 23], target: [0, 3.1, 0] },
  side: { position: [0, 5.7, 29], target: [0, 5.2, 0] },
  ground: { position: [0, 2.25, 14], target: [0, 0.18, -1.5] }
});

let resolveReady!: (api: RainWindLabApi) => void;
let rejectReady!: (error: unknown) => void;
window.rainWindLabReady = new Promise<RainWindLabApi>((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  window.rainWindLabError = message;
  document.body.dataset.state = "error";
  requiredElement<HTMLElement>("[data-loading-message]").textContent = message;
  setOutput("state", "加载失败");
  rejectReady(error);
  console.error("[rain-wind-lab] startup failed", error);
});

class FlatRainImpactSurface implements TerrainRainImpactSurfaceProvider {
  sampleHeightInterpolated(): number {
    return 0;
  }

  sampleRainImpact(
    _worldX: number,
    _worldZ: number,
    _climate: Readonly<TerrainRainImpactClimate>,
    outSample: TerrainRainImpactSample
  ): boolean {
    outSample.height = 0;
    outSample.normal[0] = 0;
    outSample.normal[1] = 1;
    outSample.normal[2] = 0;
    outSample.puddleMask = 1;
    return true;
  }
}

class RainWindLabDriver extends Script {
  vfx: TerrainPrecipitationVfx | null = null;
  windSpeedMps = INITIAL_WIND_SPEED_MPS;
  rainRate = INITIAL_RAIN_RATE;
  rainTurbulence = INITIAL_RAIN_TURBULENCE;
  paused = false;
  onSnapshot: (() => void) | null = null;
  private readonly _windVelocity: [number, number, number] = [INITIAL_WIND_SPEED_MPS, 0, 0];
  private readonly _surfaceVelocity: readonly [number, number, number] = Object.freeze([0, 0, 0]);
  private _nextUiUpdateMilliseconds = 0;

  override onUpdate(deltaTime: number): void {
    this._updatePrecipitation(deltaTime);
    const now = performance.now();
    if (now < this._nextUiUpdateMilliseconds) return;
    this._nextUiUpdateMilliseconds = now + 100;
    this.onSnapshot?.();
  }

  applyImmediately(): void {
    this._updatePrecipitation(0);
    this.onSnapshot?.();
  }

  private _updatePrecipitation(deltaTime: number): void {
    this._windVelocity[0] = this.windSpeedMps;
    this.vfx?.update(deltaTime, this.rainRate, 0, 1, this._windVelocity, this._surfaceVelocity, this.rainTurbulence, 0);
  }
}

async function boot(): Promise<void> {
  const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene!;
  scene.background.solidColor = new Color(0.025, 0.055, 0.076, 1);
  scene.ambientLight.diffuseSolidColor.set(0.35, 0.47, 0.54, 1);
  scene.ambientLight.diffuseIntensity = 0.72;
  const root = scene.createRootEntity("Rain wind standalone acceptance scene");

  const cameraEntity = root.createChild("Rain observation camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 48;
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = 220;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.minDistance = 4;
  orbit.maxDistance = 80;
  applyCameraPreset(camera, orbit, "overview");

  const sunEntity = root.createChild("Rain lab key light");
  sunEntity.transform.setRotation(-52, -34, 0);
  const sun = sunEntity.addComponent(DirectLight);
  sun.color = new Color(0.72, 0.84, 0.92, 1);
  scene.sun = sun;

  createGroundScale(engine, root);
  const precipitation = await TerrainPrecipitationVfx.create(
    engine,
    root.createChild("Production rain VFX owner"),
    camera,
    new FlatRainImpactSurface()
  );
  const driver = root.addComponent(RainWindLabDriver);
  driver.vfx = precipitation;

  const diagnostics = (): RainWindLabDiagnostics => {
    const displacement = resolveWindRelaxedDisplacement(
      [driver.windSpeedMps, 0, 0],
      RAIN_RESPONSE_TIME_SECONDS,
      REPRESENTATIVE_RAIN_AGE_SECONDS
    )[0];
    const relaxedHorizontalVelocity =
      driver.windSpeedMps * (1 - Math.exp(-REPRESENTATIVE_RAIN_AGE_SECONDS / RAIN_RESPONSE_TIME_SECONDS));
    return {
      ready: true,
      paused: driver.paused,
      windSpeedMps: driver.windSpeedMps,
      rainRate: driver.rainRate,
      rainTurbulence: driver.rainTurbulence,
      snowRate: 0,
      representativeAgeSeconds: REPRESENTATIVE_RAIN_AGE_SECONDS,
      representativeHorizontalDisplacementMeters: displacement,
      representativeTiltDegrees:
        (Math.atan2(relaxedHorizontalVelocity, REPRESENTATIVE_VERTICAL_SPEED_MPS) * 180) / Math.PI,
      precipitation: precipitation.getSnapshot()
    };
  };

  const publish = (): RainWindLabDiagnostics => {
    const snapshot = diagnostics();
    syncUi(snapshot);
    return snapshot;
  };
  driver.onSnapshot = publish;

  const setWindSpeed = (speedMps: number): RainWindLabDiagnostics => {
    driver.windSpeedMps = finiteNumber(speedMps, "Rain wind speed");
    driver.applyImmediately();
    return diagnostics();
  };
  const setRainRate = (rate: number): RainWindLabDiagnostics => {
    driver.rainRate = clamp01(finiteNumber(rate, "Rain rate"));
    driver.applyImmediately();
    return diagnostics();
  };
  const setRainTurbulence = (turbulence: number): RainWindLabDiagnostics => {
    driver.rainTurbulence = clamp01(finiteNumber(turbulence, "Rain turbulence"));
    driver.applyImmediately();
    return diagnostics();
  };
  const setPaused = (paused: boolean): RainWindLabDiagnostics => {
    driver.paused = Boolean(paused);
    engine.time.timeScale = driver.paused ? 0 : 1;
    return publish();
  };
  const setCamera = (preset: RainWindCameraPreset): RainWindLabDiagnostics => {
    if (!(preset in CAMERA_PRESETS)) throw new RangeError(`Unknown rain camera preset: ${preset}`);
    applyCameraPreset(camera, orbit, preset);
    syncCameraButtons(preset);
    return publish();
  };

  const api: RainWindLabApi = {
    ready: true,
    getDiagnostics: diagnostics,
    setWindSpeed,
    reverseWind: () => setWindSpeed(driver.windSpeedMps === 0 ? -INITIAL_WIND_SPEED_MPS : -driver.windSpeedMps),
    setRainRate,
    setRainTurbulence,
    setPaused,
    setCamera
  };
  bindUi(api);
  window.rainWindLab = api;
  driver.applyImmediately();
  engine.run();
  document.body.dataset.state = "ready";
  setOutput("state", "雨场运行中");
  publish();
  resolveReady(api);

  window.addEventListener(
    "beforeunload",
    () => {
      driver.enabled = false;
      precipitation.destroy();
      window.rainWindLab = undefined;
    },
    { once: true }
  );
}

function createGroundScale(engine: Engine, parent: Entity): void {
  const ground = parent.createChild("Wet calibration ground");
  ground.transform.setPosition(0, -0.035, 0);
  const renderer = ground.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 90, 74, 1, 1, false);
  renderer.setMaterial(createMaterial(engine, "Wet charcoal ground", new Color(0.045, 0.095, 0.105, 1), 0.46));
  renderer.receiveShadows = true;

  const minorMaterial = createMaterial(engine, "Five metre marker", new Color(0.16, 0.27, 0.3, 1), 0.72);
  const majorMaterial = createMaterial(engine, "Ten metre marker", new Color(0.16, 0.5, 0.64, 1), 0.55);
  for (let x = -40; x <= 40; x += 5) {
    const major = x % 10 === 0;
    createCuboid(
      engine,
      parent,
      `Crosswind ${x} metre ${major ? "major" : "minor"} marker`,
      [x, 0.012, 0],
      [major ? 0.055 : 0.025, 0.018, 64],
      major ? majorMaterial : minorMaterial
    );
  }
  for (let z = -30; z <= 30; z += 10) {
    createCuboid(engine, parent, `Depth ${z} metre marker`, [0, 0.014, z], [80, 0.02, 0.035], minorMaterial);
  }

  const verticalMaterial = createMaterial(engine, "Vertical trajectory reference", new Color(0.32, 0.68, 0.78, 1), 0.4);
  for (const x of [-20, 0, 20]) {
    createCuboid(engine, parent, `Vertical reference ${x}`, [x, 4, -7], [0.04, 8, 0.04], verticalMaterial);
  }
}

function createCuboid(
  engine: Engine,
  parent: Entity,
  name: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  material: PBRMaterial
): void {
  const entity = parent.createChild(name);
  entity.transform.setPosition(...position);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, ...size);
  renderer.setMaterial(material);
}

function createMaterial(engine: Engine, name: string, color: Color, roughness: number): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = name;
  material.baseColor = color;
  material.roughness = roughness;
  material.metallic = 0;
  return material;
}

function applyCameraPreset(camera: Camera, orbit: OrbitControl, preset: RainWindCameraPreset): void {
  const state = CAMERA_PRESETS[preset];
  camera.entity.transform.setPosition(...state.position);
  const target = new Vector3(...state.target);
  camera.entity.transform.lookAt(target);
  orbit.target.copyFrom(target);
}

function bindUi(api: RainWindLabApi): void {
  const range = requiredElement<HTMLInputElement>("[data-control='wind-range']");
  const number = requiredElement<HTMLInputElement>("[data-control='wind-number']");
  const rainRate = requiredElement<HTMLInputElement>("[data-control='rain-rate']");
  const turbulence = requiredElement<HTMLInputElement>("[data-control='turbulence']");

  range.addEventListener("input", () => api.setWindSpeed(Number(range.value)));
  number.addEventListener("input", () => {
    if (Number.isFinite(number.valueAsNumber)) api.setWindSpeed(number.valueAsNumber);
  });
  rainRate.addEventListener("input", () => api.setRainRate(Number(rainRate.value)));
  turbulence.addEventListener("input", () => api.setRainTurbulence(Number(turbulence.value)));
  for (const speed of WIND_PRESETS) {
    requiredElement<HTMLButtonElement>(`[data-wind-preset='${speed}']`).addEventListener("click", () => {
      api.setWindSpeed(speed);
    });
  }
  requiredElement<HTMLButtonElement>("[data-action='reverse']").addEventListener("click", () => api.reverseWind());
  requiredElement<HTMLButtonElement>("[data-action='pause']").addEventListener("click", () => {
    api.setPaused(!api.getDiagnostics().paused);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((button) => {
    button.addEventListener("click", () => api.setCamera(button.dataset.camera as RainWindCameraPreset));
  });
}

function syncUi(snapshot: RainWindLabDiagnostics): void {
  const speed = snapshot.windSpeedMps;
  const speedSign = speed > 0 ? "+" : "";
  setOutput("wind-speed", `${speedSign}${speed.toFixed(1)} m/s`);
  setOutput("rain-rate", `${Math.round(snapshot.rainRate * 100)}%`);
  setOutput("turbulence", `${Math.round(snapshot.rainTurbulence * 100)}%`);
  setOutput("flow-direction", `${speed < 0 ? "−X" : speed > 0 ? "+X" : "CALM"} / ${Math.abs(speed).toFixed(1)} m/s`);
  setOutput("air-target", `[${speed.toFixed(1)}, 0, 0] m/s`);
  setOutput("rain-target", tuple(snapshot.precipitation.rainTargetVelocityWS, "m/s"));
  setOutput("emitter-offset", tuple(snapshot.precipitation.rainEmitterOffsetWS, "m"));
  setOutput("displacement", `${snapshot.representativeHorizontalDisplacementMeters.toFixed(2)} m`);
  setOutput("tilt", `${snapshot.representativeTiltDegrees.toFixed(1)}°`);
  setOutput("emission", `${snapshot.precipitation.rainParticlesPerSecond.toFixed(0)} /s`);
  setOutput("impacts", String(snapshot.precipitation.rainImpactCount));
  setOutput("snow-emission", `${snapshot.precipitation.snowParticlesPerSecond.toFixed(0)} /s`);
  setOutput("state", snapshot.paused ? "粒子已暂停" : "雨场运行中");

  document.body.dataset.paused = String(snapshot.paused);
  const range = requiredElement<HTMLInputElement>("[data-control='wind-range']");
  range.value = String(Math.min(Math.max(speed, Number(range.min)), Number(range.max)));
  const number = requiredElement<HTMLInputElement>("[data-control='wind-number']");
  if (document.activeElement !== number) number.value = String(speed);
  requiredElement<HTMLInputElement>("[data-control='rain-rate']").value = String(snapshot.rainRate);
  requiredElement<HTMLInputElement>("[data-control='turbulence']").value = String(snapshot.rainTurbulence);
  document.querySelectorAll<HTMLButtonElement>("[data-wind-preset]").forEach((button) => {
    button.dataset.active = String(Math.abs(speed) === Number(button.dataset.windPreset));
  });

  const arrow = requiredElement<HTMLElement>("[data-flow-arrow]");
  arrow.style.transform = `scaleX(${speed < 0 ? -1 : 1})`;
  arrow.style.width = `${Math.min(230, 70 + Math.sqrt(Math.abs(speed)) * 18)}px`;
  const reverse = requiredElement<HTMLButtonElement>("[data-action='reverse']");
  const reversed = speed === 0 ? -INITIAL_WIND_SPEED_MPS : -speed;
  reverse.textContent = `${formatCompact(speed)} → ${formatCompact(reversed)} 反向`;
  const pause = requiredElement<HTMLButtonElement>("[data-action='pause']");
  pause.textContent = snapshot.paused ? "继续粒子" : "暂停粒子";
  pause.dataset.active = String(snapshot.paused);
}

function syncCameraButtons(preset: RainWindCameraPreset): void {
  document.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((button) => {
    button.dataset.active = String(button.dataset.camera === preset);
  });
}

function tuple(value: readonly [number, number, number], unit: string): string {
  return `[${value.map((entry) => entry.toFixed(1)).join(", ")}] ${unit}`;
}

function formatCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function setOutput(name: string, value: string): void {
  requiredElement<HTMLOutputElement>(`[data-output='${name}']`).value = value;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Rain wind lab UI is missing ${selector}`);
  return element;
}
