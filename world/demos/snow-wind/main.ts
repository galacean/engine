import {
  AssetType,
  BackgroundMode,
  Camera,
  Color,
  DiffuseMode,
  DirectLight,
  DepthTextureMode,
  Entity,
  MeshRenderer,
  ParticleCurveMode,
  ParticleRenderer,
  ParticleSimulationSpace,
  ParticleStopMode,
  PBRMaterial,
  PrefabResource,
  PrimitiveMesh,
  Script,
  ShadowType,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  Vector2,
  Vector3,
  WebGLEngine,
  WebGLMode,
  type Engine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { acquireCameraDepthTexturePrePass } from "@galacean/engine-modify/rendering/CameraDepthTexturePrePass";
import {
  resolveCameraLocalPrecipitationTraversalTime,
  resolveParticleSimulationWindVelocity,
  resolveWindRelaxedEmitterOffset,
  type PrecipitationVector3Tuple
} from "@galacean/engine-environment/terrain/environment/TerrainPrecipitationTrajectory";

const SNOW_RESPONSE_TIME_SECONDS = 0.35;
const SNOW_PARTICLES_PER_SECOND = 7200;
const SNOW_MAX_HORIZONTAL_TRAVEL_METERS = 10;
const SNOW_HORIZONTAL_WRAP_SIZE_METERS = 28;
const SNOW_WIND_DIRECTION_X = 1;
const SNOW_WIND_DIRECTION_Z = 0.16;
const SNOW_SOFT_DEPTH_MACRO = "MATERIAL_SNOW_SOFT_DEPTH";
const SNOW_PREFAB_VIRTUAL_PATH = "/Prefabs/P_VFX_Snow_01/P_VFX_Snow_01.prefab";
const SNOW_MATERIAL_VIRTUAL_PATH = "/Materials/M_VFX_Snow_01_56161fad42.mat";
const SNOW_SHADER_VIRTUAL_PATH = "/Shaders/S_VFX_TransparentAlpha_8541b131eb.shader";
const SNOW_TEXTURE_VIRTUAL_PATH = "/Textures/T_VFX_Snowflake_01_O.ktx2";
const SNOW_PREFAB_URL = new URL("../../../packages/environment/src/assets/weather/P_VFX_Snow_01.prefab", import.meta.url);
const SNOW_MATERIAL_URL = new URL("../../../packages/environment/src/assets/weather/M_VFX_Snow_01_56161fad42.mat", import.meta.url);
const SNOW_SHADER_URL = new URL("../../../packages/environment/src/assets/weather/S_VFX_TransparentAlpha_8541b131eb.shader", import.meta.url);
const SNOW_TEXTURE_URL = new URL("../../../packages/environment/src/assets/weather/T_VFX_Snowflake_01_O.ktx2", import.meta.url);

interface SnowWindSnapshot {
  readonly speedMps: number;
  readonly targetVelocityWS: readonly [number, number, number];
  readonly emitterOffsetWS: readonly [number, number, number];
  readonly responseTimeSeconds: number;
  readonly maxLifetimeSeconds: number;
}

interface SnowWindDemoApi {
  setWindSpeed(speedMps: number): void;
  restart(): void;
  getSnapshot(): SnowWindSnapshot;
}

declare global {
  interface Window {
    snowWindDemo?: SnowWindDemoApi;
    snowWindDemoError?: string;
  }
}

class CameraRelativeSnow extends Script {
  camera!: Camera;
  snowEntity!: Entity;
  wind!: ParticleRenderer["generator"]["windOverLifetime"];

  readonly targetVelocityWS: PrecipitationVector3Tuple = [0, 0, 0];
  readonly emitterOffsetWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _viewportSize = new Vector2();

  onUpdate(): void {
    const { width, height } = this.camera.pixelViewport;
    if (this._viewportSize.x !== width || this._viewportSize.y !== height) {
      this._viewportSize.set(width, height);
      this.camera.shaderData.setVector2("camera_ViewportSize", this._viewportSize);
    }
    const cameraPosition = this.camera.entity.transform.worldPosition;
    const wrapCenter = this.wind.wrapCenter;
    if (wrapCenter.x !== cameraPosition.x || wrapCenter.y !== cameraPosition.y || wrapCenter.z !== cameraPosition.z) {
      wrapCenter.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    }
    this.snowEntity.transform.setWorldPosition(
      cameraPosition.x + this.emitterOffsetWS[0],
      cameraPosition.y + this.emitterOffsetWS[1],
      cameraPosition.z + this.emitterOffsetWS[2]
    );
  }
}

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  window.snowWindDemoError = message;
  setStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`, "error");
  console.error("[snow-wind] startup failed", error);
});

async function boot(): Promise<void> {
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  engine.canvas.setAutoResolution();
  engine.resourceManager.retryCount = 2;

  const scene = engine.sceneManager.activeScene!;
  scene.background.mode = BackgroundMode.SolidColor;
  scene.background.solidColor.set(0.025, 0.055, 0.095, 1);
  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor.set(0.34, 0.46, 0.62, 1);
  scene.ambientLight.diffuseIntensity = 0.92;
  scene.ambientLight.specularIntensity = 0;

  const root = scene.createRootEntity("Snow wind isolation scene");
  const camera = createCamera(root);
  createLighting(root);
  createStage(engine, root);
  engine.run();

  const snowPrefab = await loadSnowPrefab(engine);
  const snowEntity = snowPrefab.instantiate();
  const snowRenderers = snowEntity.getComponentsIncludeChildren(ParticleRenderer, []);
  if (snowRenderers.length !== 1) {
    snowEntity.destroy();
    throw new Error(`Snow observation scene requires exactly one ParticleRenderer, received ${snowRenderers.length}`);
  }

  const snowRenderer = snowRenderers[0];
  const generator = snowRenderer.generator;
  generator.main.playOnEnabled = false;
  generator.emission.rateOverTime.constant = SNOW_PARTICLES_PER_SECOND;
  generator.forceOverLifetime.enabled = false;
  const authoredVelocity = generator.velocityOverLifetime;
  authoredVelocity.space = ParticleSimulationSpace.World;
  authoredVelocity.velocityX.constantMin = 0;
  authoredVelocity.velocityX.constantMax = 0;
  authoredVelocity.velocityZ.constantMin = 0;
  authoredVelocity.velocityZ.constantMax = 0;

  const simulationSpeed = generator.main.simulationSpeed;
  if (!Number.isFinite(simulationSpeed) || simulationSpeed <= 0) {
    snowEntity.destroy();
    throw new Error(`Snow Prefab requires a positive simulation speed, received ${simulationSpeed}`);
  }
  const startLifetime = generator.main.startLifetime;
  if (startLifetime.mode !== ParticleCurveMode.Constant && startLifetime.mode !== ParticleCurveMode.TwoConstants) {
    snowEntity.destroy();
    throw new Error(`Snow Prefab requires a constant lifetime, received mode ${startLifetime.mode}`);
  }
  const authoredMaxLifetimeSeconds = Math.max(startLifetime.constantMin, startLifetime.constantMax) / simulationSpeed;
  if (!Number.isFinite(authoredMaxLifetimeSeconds) || authoredMaxLifetimeSeconds <= 0) {
    snowEntity.destroy();
    throw new Error(`Snow Prefab requires a positive maximum lifetime, received ${authoredMaxLifetimeSeconds}`);
  }

  const wind = generator.windOverLifetime;
  wind.responseTime = SNOW_RESPONSE_TIME_SECONDS * simulationSpeed;
  wind.influence.set(1, 0, 1);
  wind.wrapSize.set(SNOW_HORIZONTAL_WRAP_SIZE_METERS, 0, SNOW_HORIZONTAL_WRAP_SIZE_METERS);
  wind.enabled = true;

  camera.entity.addChild(snowEntity);
  snowEntity.transform.setPosition(0, 0, 0);
  const anchor = root.addComponent(CameraRelativeSnow);
  anchor.camera = camera;
  anchor.snowEntity = snowEntity;
  anchor.wind = wind;

  let speedMps = 2;
  const setWindSpeed = (nextSpeedMps: number): void => {
    if (!Number.isFinite(nextSpeedMps) || nextSpeedMps < 0 || nextSpeedMps > 110) {
      throw new RangeError("Snow wind speed must be finite and within [0, 110] m/s");
    }
    speedMps = nextSpeedMps;
    const directionLength = Math.hypot(SNOW_WIND_DIRECTION_X, SNOW_WIND_DIRECTION_Z);
    anchor.targetVelocityWS[0] = (SNOW_WIND_DIRECTION_X / directionLength) * speedMps;
    anchor.targetVelocityWS[1] = 0;
    anchor.targetVelocityWS[2] = (SNOW_WIND_DIRECTION_Z / directionLength) * speedMps;
    const simulationTarget = resolveParticleSimulationWindVelocity(anchor.targetVelocityWS, simulationSpeed);
    wind.targetVelocity.set(simulationTarget[0], simulationTarget[1], simulationTarget[2]);
    const emitterTraversalSeconds = resolveCameraLocalPrecipitationTraversalTime(
      anchor.targetVelocityWS,
      SNOW_RESPONSE_TIME_SECONDS,
      authoredMaxLifetimeSeconds,
      SNOW_MAX_HORIZONTAL_TRAVEL_METERS
    );
    resolveWindRelaxedEmitterOffset(
      anchor.targetVelocityWS,
      SNOW_RESPONSE_TIME_SECONDS,
      emitterTraversalSeconds,
      anchor.emitterOffsetWS
    );
    anchor.onUpdate();
    updateControls(speedMps, anchor.targetVelocityWS, anchor.emitterOffsetWS, authoredMaxLifetimeSeconds);
  };

  const restart = (): void => {
    generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    generator.play(false);
  };

  window.snowWindDemo = {
    setWindSpeed,
    restart,
    getSnapshot: () => ({
      speedMps,
      targetVelocityWS: [anchor.targetVelocityWS[0], anchor.targetVelocityWS[1], anchor.targetVelocityWS[2]],
      emitterOffsetWS: [anchor.emitterOffsetWS[0], anchor.emitterOffsetWS[1], anchor.emitterOffsetWS[2]],
      responseTimeSeconds: SNOW_RESPONSE_TIME_SECONDS,
      maxLifetimeSeconds: authoredMaxLifetimeSeconds
    })
  };
  installControls(setWindSpeed, restart);
  const cameraDepthTextureLease = acquireCameraDepthTexturePrePass(
    camera,
    DepthTextureMode.PrePass,
    "snow-wind-soft-fade"
  );
  snowRenderer.shaderData.enableMacro(SNOW_SOFT_DEPTH_MACRO);
  setWindSpeed(speedMps);
  restart();
  setStatus("WebGL2 · authored flakes · exposure streaks · camera-local wrap", "ready");

  window.addEventListener(
    "beforeunload",
    () => {
      window.snowWindDemo = undefined;
      cameraDepthTextureLease.destroy();
      anchor.enabled = false;
      generator.stop(false, ParticleStopMode.StopEmittingAndClear);
    },
    { once: true }
  );
}

function createCamera(root: Entity): Camera {
  const cameraEntity = root.createChild("Snow observation camera");
  cameraEntity.transform.setPosition(0, 4.4, 13.5);
  cameraEntity.transform.lookAt(new Vector3(0, 1.4, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 50;
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = 180;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.target.set(0, 1.4, 0);
  orbit.minDistance = 7;
  orbit.maxDistance = 28;
  return camera;
}

function createLighting(root: Entity): void {
  const lightEntity = root.createChild("Cold moon key light");
  lightEntity.transform.setRotation(-52, -28, 0);
  const light = lightEntity.addComponent(DirectLight);
  light.color = new Color(0.69, 0.82, 1, 1);
  light.shadowType = ShadowType.SoftLow;
}

function createStage(engine: Engine, root: Entity): void {
  const groundMaterial = createMaterial(engine, "Blue snow floor", [0.09, 0.17, 0.25, 1], 0.96);
  const snowMaterial = createMaterial(engine, "Snow banks", [0.58, 0.72, 0.84, 1], 0.88);
  const rockMaterial = createMaterial(engine, "Dark scale markers", [0.055, 0.095, 0.14, 1], 0.84);

  const ground = root.createChild("Observation ground");
  ground.transform.setPosition(0, -1.05, 0);
  const groundRenderer = ground.addComponent(MeshRenderer);
  groundRenderer.mesh = PrimitiveMesh.createPlane(engine, 30, 22, 1, 1, false);
  groundRenderer.setMaterial(groundMaterial);
  groundRenderer.receiveShadows = true;

  createCuboid(engine, root, "Left snow bank", [-6.8, -0.58, -1.5], [4.8, 0.9, 5.2], snowMaterial);
  createCuboid(engine, root, "Right snow bank", [6.5, -0.7, 1.8], [5.2, 0.65, 4], snowMaterial);
  createCuboid(engine, root, "Rear snow shelf", [0.3, -0.72, -6], [8.8, 0.55, 2.2], snowMaterial);
  createCuboid(engine, root, "Tall scale marker", [-4.25, 1.1, -3.8], [1.15, 4.3, 1.15], rockMaterial);
  createCuboid(engine, root, "Mid scale marker", [1.1, 0.3, -4.75], [1.5, 2.7, 1.5], rockMaterial);
  createCuboid(engine, root, "Near scale marker", [4.7, -0.15, -1.7], [1.05, 1.75, 1.05], rockMaterial);
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
  renderer.castShadows = true;
  renderer.receiveShadows = true;
}

function createMaterial(
  engine: Engine,
  name: string,
  color: readonly [number, number, number, number],
  roughness: number
): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = name;
  material.baseColor = new Color(...color);
  material.roughness = roughness;
  material.metallic = 0;
  return material;
}

async function loadSnowPrefab(engine: Engine): Promise<PrefabResource> {
  engine.resourceManager.registerVirtualResources([
    { virtualPath: SNOW_PREFAB_VIRTUAL_PATH, path: SNOW_PREFAB_URL.href, type: AssetType.Prefab },
    { virtualPath: SNOW_MATERIAL_VIRTUAL_PATH, path: SNOW_MATERIAL_URL.href, type: AssetType.Material },
    { virtualPath: SNOW_SHADER_VIRTUAL_PATH, path: SNOW_SHADER_URL.href, type: AssetType.Shader },
    {
      virtualPath: SNOW_TEXTURE_VIRTUAL_PATH,
      path: SNOW_TEXTURE_URL.href,
      type: AssetType.KTX2
    }
  ]);
  const snowTexture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.KTX2,
    url: SNOW_TEXTURE_VIRTUAL_PATH
  });
  if (!(snowTexture instanceof Texture2D)) {
    throw new Error(`Snow opacity asset did not resolve to Texture2D: ${SNOW_TEXTURE_VIRTUAL_PATH}`);
  }
  snowTexture.filterMode = TextureFilterMode.Bilinear;
  snowTexture.wrapModeU = TextureWrapMode.Repeat;
  snowTexture.wrapModeV = TextureWrapMode.Repeat;
  snowTexture.anisoLevel = 1;
  const prefab = await engine.resourceManager.load<PrefabResource>({
    type: AssetType.Prefab,
    url: SNOW_PREFAB_VIRTUAL_PATH
  });
  if (!(prefab instanceof PrefabResource)) {
    throw new Error(`Snow asset did not resolve to a PrefabResource: ${SNOW_PREFAB_VIRTUAL_PATH}`);
  }
  return prefab;
}

function installControls(setWindSpeed: (speedMps: number) => void, restart: () => void): void {
  for (const element of document.querySelectorAll<HTMLButtonElement>("[data-wind-speed]")) {
    element.addEventListener("click", () => setWindSpeed(Number(element.dataset.windSpeed)));
  }
  requireElement<HTMLButtonElement>("no-wind").addEventListener("click", () => setWindSpeed(0));
  requireElement<HTMLButtonElement>("restart").addEventListener("click", restart);
}

function updateControls(
  speedMps: number,
  targetVelocityWS: readonly [number, number, number],
  emitterOffsetWS: readonly [number, number, number],
  maxLifetimeSeconds: number
): void {
  requireElement<HTMLElement>("wind-value").innerHTML = `${format(speedMps)} <small>m/s</small>`;
  requireElement<HTMLOutputElement>("wind-target").value = formatVector(targetVelocityWS, "m/s");
  requireElement<HTMLOutputElement>("emitter-offset").value = formatVector(emitterOffsetWS, "m");
  requireElement<HTMLOutputElement>("timing").value =
    `${SNOW_RESPONSE_TIME_SECONDS.toFixed(2)} s / ${maxLifetimeSeconds.toFixed(1)} s`;
  for (const element of document.querySelectorAll<HTMLButtonElement>("[data-wind-speed]")) {
    element.classList.toggle("active", Number(element.dataset.windSpeed) === speedMps);
  }
  requireElement<HTMLButtonElement>("no-wind").classList.toggle("active", speedMps === 0);
}

function setStatus(message: string, state?: "ready" | "error"): void {
  const status = requireElement<HTMLElement>("status");
  status.textContent = message;
  status.className = state ?? "";
}

function format(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatVector(value: readonly [number, number, number], unit: string): string {
  return `${value[0].toFixed(1)}, ${value[1].toFixed(1)}, ${value[2].toFixed(1)} ${unit}`;
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Snow wind demo is missing #${id}`);
  return element as T;
}
