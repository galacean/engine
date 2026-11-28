import {
  AssetType,
  BackgroundMode,
  Camera,
  Color,
  DiffuseMode,
  DirectLight,
  Engine,
  Entity,
  Logger,
  MeshRenderer,
  PBRMaterial,
  PointLight,
  PrimitiveMesh,
  RealtimeIBLBaker,
  ScreenSpaceReflectionQuality,
  Script,
  SkyProceduralMaterial,
  SSRDiagnostics,
  Texture2D,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";

Logger.enable();

type DemoQualityKey = "low" | "medium" | "high" | "xhigh";
type DemoPoseKey = "overview" | "clearcoat" | "layered" | "waterfall";

interface CameraPoseConfig {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fieldOfView: number;
}

const CAMERA_POSES: Readonly<Record<DemoPoseKey, CameraPoseConfig>> = {
  overview: { position: [0.4, 3.8, 9.4], target: [0.0, 0.85, 0.0], fieldOfView: 46 },
  clearcoat: { position: [-2.8, 2.0, 3.8], target: [-2.4, 0.95, 0.0], fieldOfView: 40 },
  layered: { position: [3.2, 2.45, 5.2], target: [2.7, 0.45, 0.3], fieldOfView: 42 },
  waterfall: { position: [-0.6, 2.1, 4.9], target: [0.3, 1.35, -2.5], fieldOfView: 44 }
};

const QUALITY_MAP: Readonly<Record<DemoQualityKey, ScreenSpaceReflectionQuality>> = {
  low: ScreenSpaceReflectionQuality.Low,
  medium: ScreenSpaceReflectionQuality.Medium,
  high: ScreenSpaceReflectionQuality.High,
  xhigh: ScreenSpaceReflectionQuality.XHigh
};

class SSRShowcaseController extends Script {
  onUpdateCallback: ((dt: number) => void) | null = null;

  override onUpdate(deltaTime: number): void {
    this.onUpdateCallback?.(deltaTime);
  }
}

function createPBRMesh(
  parent: Entity,
  name: string,
  mesh: ReturnType<typeof PrimitiveMesh.createPlane>,
  material: PBRMaterial,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0]
): Entity {
  const entity = parent.createChild(name);
  entity.transform.setPosition(position[0], position[1], position[2]);
  entity.transform.setRotation(rotation[0], rotation[1], rotation[2]);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(material);
  renderer.castShadows = true;
  renderer.receiveShadows = true;
  return entity;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function qualityLabel(quality: ScreenSpaceReflectionQuality): string {
  switch (quality) {
    case ScreenSpaceReflectionQuality.Low:
      return "Low (0.25x)";
    case ScreenSpaceReflectionQuality.Medium:
      return "Medium (0.5x + TA)";
    case ScreenSpaceReflectionQuality.High:
      return "High (0.5x + Bilat)";
    case ScreenSpaceReflectionQuality.XHigh:
      return "XHigh (1.0x Full)";
  }
}

async function bootstrap(): Promise<void> {
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const engine = await WebGLEngine.create({
    canvas,
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: {
      alpha: false,
      stencil: true
    }
  });
  engine.canvas.setAutoResolution();

  const scene = engine.sceneManager.activeScene!;
  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor.set(0.22, 0.28, 0.36, 1.0);
  scene.ambientLight.diffuseIntensity = 0.7;
  scene.ambientLight.specularIntensity = 0.85;

  // Procedural sky gives immediate non-black IBL fallback with zero external network wait.
  const sky = scene.background;
  sky.mode = BackgroundMode.Sky;
  const skyMaterial = new SkyProceduralMaterial(engine);
  skyMaterial.sunMode = 0;
  skyMaterial.atmosphereThickness = 0.9;
  skyMaterial.groundTint.set(0.08, 0.11, 0.15, 1);
  skyMaterial.skyTint.set(0.22, 0.42, 0.68, 1);
  skyMaterial.exposure = 1.05;
  sky.sky.material = skyMaterial;
  sky.sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  const root = scene.createRootEntity("SSRShowcaseRoot");

  // Directional key light + subtle rim point light
  const sunEntity = root.createChild("KeyLight");
  sunEntity.transform.setRotation(-42, 32, 0);
  const sunLight = sunEntity.addComponent(DirectLight);
  sunLight.color = new Color(1.0 * 1.3, 0.96 * 1.3, 0.9 * 1.3, 1.0);
  scene.sun = sunLight;

  const accentLightEntity = root.createChild("AccentLight");
  accentLightEntity.transform.setPosition(-2.0, 3.5, 2.0);
  const accentLight = accentLightEntity.addComponent(PointLight);
  accentLight.color = new Color(0.45 * 1.6, 0.78 * 1.6, 1.0 * 1.6, 1.0);
  accentLight.distance = 16;

  // Camera + OrbitControl
  const cameraEntity = root.createChild("MainCamera");
  const camera = cameraEntity.addComponent(Camera);
  camera.nearClipPlane = 0.2;
  camera.farClipPlane = 80;
  camera.enableHDR = true;
  camera.enableScreenSpaceReflection = true;

  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.enableDamping = false;
  orbit.minDistance = 1.5;
  orbit.maxDistance = 24;

  // Configure scene-level v2 mobile-first SSR settings
  const ssrSettings = scene.screenSpaceReflection;
  ssrSettings.enabled = true;
  ssrSettings.quality = ScreenSpaceReflectionQuality.High;
  ssrSettings.intensity = 1.0;
  ssrSettings.maxRoughness = 0.6;
  ssrSettings.maxDistance = 24;
  ssrSettings.thickness = 0.18;
  ssrSettings.edgeFade = 0.1;
  ssrSettings.temporalBlend = 0.85;

  // Load local seamless normal map for gentle animated water waves
  let waterNormalTex: Texture2D | null = null;
  try {
    waterNormalTex = await engine.resourceManager.load<Texture2D>({
      url: new URL("./assets/water-surface-normal.png", import.meta.url).href,
      type: AssetType.Texture
    });
  } catch {
    waterNormalTex = null;
  }

  // 1. Main glossy dark floor + emissive pillars (LDR/HDR highlight & reflection alignment check)
  const floorMat = new PBRMaterial(engine);
  floorMat.name = "Glossy Floor";
  floorMat.baseColor = new Color(0.08, 0.1, 0.13, 1.0);
  floorMat.roughness = 0.06;
  floorMat.metallic = 0.25;
  floorMat.screenSpaceReflectionIntensity = 1.0;
  createPBRMesh(root, "GlossyFloor", PrimitiveMesh.createPlane(engine, 16, 12), floorMat, [0, 0, 0]);

  const pillarConfigs: ReadonlyArray<{ pos: [number, number, number]; color: [number, number, number] }> = [
    { pos: [-4.4, 1.8, -2.5], color: [1.0, 0.22, 0.36] },
    { pos: [-1.4, 2.0, -3.2], color: [1.0, 0.78, 0.18] },
    { pos: [1.9, 1.9, -3.0], color: [0.16, 0.92, 0.72] },
    { pos: [4.6, 1.8, -2.2], color: [0.32, 0.56, 1.0] }
  ];
  for (let i = 0; i < pillarConfigs.length; i++) {
    const cfg = pillarConfigs[i];
    const pillarMat = new PBRMaterial(engine);
    pillarMat.name = `NeonPillarMat_${i}`;
    pillarMat.baseColor = new Color(cfg.color[0] * 0.25, cfg.color[1] * 0.25, cfg.color[2] * 0.25, 1);
    pillarMat.emissiveColor = new Color(cfg.color[0] * 1.8, cfg.color[1] * 1.8, cfg.color[2] * 1.8, 1);
    pillarMat.roughness = 0.85;
    pillarMat.screenSpaceReflectionIntensity = 0;
    createPBRMesh(
      root,
      `NeonPillar_${i}`,
      PrimitiveMesh.createCuboid(engine, 0.55, 3.6, 0.55),
      pillarMat,
      cfg.pos
    );
  }

  // Moving glowing orb to verify temporal clamp & zero ghosting
  const orbMat = new PBRMaterial(engine);
  orbMat.name = "MovingOrb";
  orbMat.baseColor = new Color(1.0, 0.45, 0.15, 1.0);
  orbMat.emissiveColor = new Color(2.4, 0.85, 0.2, 1.0);
  orbMat.roughness = 0.9;
  orbMat.screenSpaceReflectionIntensity = 0;
  const movingOrb = createPBRMesh(
    root,
    "MovingOrb",
    PrimitiveMesh.createSphere(engine, 0.42, { subdivisionLevel: 3 }),
    orbMat,
    [0, 1.5, 0.4]
  );

  // 2. Clear Coat sphere (matte paint under smooth clear coat) + Matte Opt-out sphere
  const clearCoatMat = new PBRMaterial(engine);
  clearCoatMat.name = "ClearCoatCoat";
  clearCoatMat.baseColor = new Color(0.1, 0.24, 0.58, 1.0);
  clearCoatMat.metallic = 0.15;
  clearCoatMat.roughness = 0.72;
  clearCoatMat.clearCoat = 1.0;
  clearCoatMat.clearCoatRoughness = 0.04;
  clearCoatMat.screenSpaceReflectionIntensity = 1.0;
  createPBRMesh(
    root,
    "ClearCoatSphere",
    PrimitiveMesh.createSphere(engine, 0.85, { subdivisionLevel: 4 }),
    clearCoatMat,
    [-2.4, 0.92, 0.1]
  );

  const optOutMat = new PBRMaterial(engine);
  optOutMat.name = "OptOutReference";
  optOutMat.baseColor = new Color(0.55, 0.18, 0.16, 1.0);
  optOutMat.metallic = 0.85;
  optOutMat.roughness = 0.12;
  optOutMat.screenSpaceReflectionIntensity = 0.0;
  createPBRMesh(
    root,
    "OptOutSphere",
    PrimitiveMesh.createSphere(engine, 0.55, { subdivisionLevel: 3 }),
    optOutMat,
    [-4.1, 0.62, 0.9]
  );

  // 3. Water over glossy submerged tiles (Closest-Wins contract + clean IBL fallback for submerged tiles)
  const submergedTileMat = new PBRMaterial(engine);
  submergedTileMat.name = "SubmergedTile";
  submergedTileMat.baseColor = new Color(0.18, 0.34, 0.42, 1.0);
  submergedTileMat.roughness = 0.06;
  submergedTileMat.metallic = 0.5;
  submergedTileMat.screenSpaceReflectionIntensity = 1.0;
  createPBRMesh(
    root,
    "SubmergedGlossyTile",
    PrimitiveMesh.createCuboid(engine, 3.6, 0.08, 3.6),
    submergedTileMat,
    [2.7, 0.06, 0.25]
  );

  const waterMat = new PBRMaterial(engine);
  waterMat.name = "ShallowWater";
  waterMat.isTransparent = true;
  waterMat.baseColor = new Color(0.05, 0.34, 0.46, 0.42);
  waterMat.roughness = 0.04;
  waterMat.metallic = 0.08;
  waterMat.screenSpaceReflectionIntensity = 1.0;
  if (waterNormalTex) {
    waterMat.normalTexture = waterNormalTex;
    waterMat.normalTextureIntensity = 0.16;
    waterMat.tilingOffset = new Vector4(3.5, 3.5, 0, 0);
  }
  createPBRMesh(root, "WaterPlane", PrimitiveMesh.createPlane(engine, 3.6, 3.6), waterMat, [2.7, 0.62, 0.25]);

  // 4. Dual-transparent Glass Pane overlapping front edge of Water Plane
  const glassMat = new PBRMaterial(engine);
  glassMat.name = "GlassPanel";
  glassMat.isTransparent = true;
  glassMat.baseColor = new Color(0.75, 0.92, 1.0, 0.26);
  glassMat.roughness = 0.04;
  glassMat.metallic = 0.1;
  glassMat.screenSpaceReflectionIntensity = 1.0;
  createPBRMesh(
    root,
    "GlassPane",
    PrimitiveMesh.createCuboid(engine, 2.1, 1.5, 0.05),
    glassMat,
    [2.6, 1.35, 1.75]
  );

  // 5. Translucent Waterfall Curtain (optional contributeScreenSpaceReflectionDepth = true)
  const waterfallMat = new PBRMaterial(engine);
  waterfallMat.name = "WaterfallCurtain";
  waterfallMat.isTransparent = true;
  waterfallMat.baseColor = new Color(0.32, 0.94, 1.0, 0.8);
  waterfallMat.emissiveColor = new Color(0.28, 0.9, 1.0, 1.0);
  waterfallMat.roughness = 0.85;
  waterfallMat.screenSpaceReflectionIntensity = 0.0;
  waterfallMat.contributeScreenSpaceReflectionDepth = true;
  createPBRMesh(
    root,
    "WaterfallCurtain",
    PrimitiveMesh.createCuboid(engine, 2.3, 2.9, 0.12),
    waterfallMat,
    [0.3, 1.5, -2.5]
  );

  // Runtime state + animation + HUD
  let frozen = false;
  let simTime = 0;
  let hudElapsed = 0;
  let currentPose: DemoPoseKey = "overview";
  const waterTiling = new Vector4(3.5, 3.5, 0, 0);

  const applyCameraPose = (pose: DemoPoseKey, cut: boolean): void => {
    currentPose = pose;
    const cfg = CAMERA_POSES[pose];
    cameraEntity.transform.setPosition(cfg.position[0], cfg.position[1], cfg.position[2]);
    orbit.target.set(cfg.target[0], cfg.target[1], cfg.target[2]);
    cameraEntity.transform.lookAt(orbit.target);
    camera.fieldOfView = cfg.fieldOfView;
    if (cut) {
      camera.notifyScreenSpaceReflectionCut();
    }
    document.body.dataset.pose = pose;
    document.querySelectorAll<HTMLButtonElement>("[data-camera-pose]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.cameraPose === pose ? "true" : "false");
    });
  };

  const syncHud = (): void => {
    const diag: Readonly<SSRDiagnostics> = camera.screenSpaceReflectionDiagnostics;
    document.body.dataset.ssr = camera.enableScreenSpaceReflection && ssrSettings.enabled ? "on" : "off";
    document.body.dataset.effective = String(diag.active);
    document.body.dataset.supported = diag.unsupportedReason ? "false" : "true";

    const stateChip = document.getElementById("effective-state")!;
    stateChip.textContent = diag.state.toUpperCase();

    document.getElementById("support-state")!.textContent = diag.unsupportedReason
      ? diag.unsupportedReason
      : `${diag.active ? "ACTIVE" : "IDLE"} (${diag.state})`;
    document.getElementById("quality-state")!.textContent = qualityLabel(ssrSettings.quality);
    document.getElementById("rt-state")!.textContent = `${diag.traceWidth}×${diag.traceHeight}`;
    document.getElementById("draw-state")!.textContent =
      `${diag.opaqueReceiverCount} / ${diag.transparentReceiverCount}`;
    const maskText = diag.useHardwareStencil ? "HW-Stencil" : "ColorMask";
    const depthPack = diag.usesPackedDepthRG8 ? "RG8" : "R16F";
    const normPack = diag.usesPackedNormalOct8 ? "OCT8" : "RGBA16F";
    document.getElementById("format-state")!.textContent = `${maskText} · ${depthPack}/${normPack}`;
    document.getElementById("memory-state")!.textContent = formatBytes(diag.estimatedBytes);
  };

  // Wire UI Controls
  const ssrCheckbox = document.getElementById("ssr-enabled") as HTMLInputElement;
  const applySsrEnabled = (enabled: boolean): void => {
    camera.enableScreenSpaceReflection = enabled;
    ssrSettings.enabled = enabled;
    ssrCheckbox.checked = enabled;
    syncHud();
  };
  ssrCheckbox.addEventListener("change", () => applySsrEnabled(ssrCheckbox.checked));

  const applyQuality = (key: DemoQualityKey): void => {
    ssrSettings.quality = QUALITY_MAP[key];
    document.querySelectorAll<HTMLButtonElement>("[data-quality-preset]").forEach((btn) => {
      btn.setAttribute("aria-pressed", btn.dataset.qualityPreset === key ? "true" : "false");
    });
    syncHud();
  };
  document.querySelectorAll<HTMLButtonElement>("[data-quality-preset]").forEach((btn) => {
    btn.addEventListener("click", () => applyQuality(btn.dataset.qualityPreset as DemoQualityKey));
  });

  const hdrBtn = document.getElementById("toggle-hdr") as HTMLButtonElement;
  const applyHdr = (enabled: boolean): void => {
    camera.enableHDR = enabled;
    hdrBtn.setAttribute("aria-pressed", String(enabled));
    hdrBtn.textContent = `HDR: ${enabled ? "On" : "Off"}`;
    syncHud();
  };
  hdrBtn.addEventListener("click", () => applyHdr(!camera.enableHDR));

  const contribBtn = document.getElementById("toggle-contrib") as HTMLButtonElement;
  const applyWaterfallContrib = (enabled: boolean): void => {
    waterfallMat.contributeScreenSpaceReflectionDepth = enabled;
    contribBtn.setAttribute("aria-pressed", String(enabled));
    contribBtn.textContent = `瀑布深度: ${enabled ? "On" : "Off"}`;
    syncHud();
  };
  contribBtn.addEventListener("click", () => applyWaterfallContrib(!waterfallMat.contributeScreenSpaceReflectionDepth));

  const cutBtn = document.getElementById("camera-cut") as HTMLButtonElement;
  cutBtn.addEventListener("click", () => {
    applyCameraPose(currentPose, true);
    syncHud();
  });

  const freezeCheckbox = document.getElementById("freeze-time") as HTMLInputElement;
  const applyFrozen = (nextFrozen: boolean): void => {
    frozen = nextFrozen;
    freezeCheckbox.checked = nextFrozen;
    document.body.dataset.frozen = String(nextFrozen);
    syncHud();
  };
  freezeCheckbox.addEventListener("change", () => applyFrozen(freezeCheckbox.checked));

  document.querySelectorAll<HTMLButtonElement>("[data-camera-pose]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pose = btn.dataset.cameraPose as DemoPoseKey;
      applyCameraPose(pose, true);
      syncHud();
    });
  });

  const captureBtn = document.getElementById("capture-diagnostics") as HTMLButtonElement;
  const captureOut = document.getElementById("diagnostic-result") as HTMLOutputElement;
  captureBtn.addEventListener("click", () => {
    captureOut.textContent = JSON.stringify(camera.screenSpaceReflectionDiagnostics);
  });

  // Update loop
  const driver = root.addComponent(SSRShowcaseController);
  driver.onUpdateCallback = (deltaTime: number) => {
    if (!frozen) {
      const dt = Math.min(Math.max(deltaTime, 0), 0.1);
      simTime += dt;
      movingOrb.transform.setPosition(
        Math.sin(simTime * 1.4) * 1.85,
        1.45 + Math.cos(simTime * 2.2) * 0.25,
        0.35 + Math.cos(simTime * 1.4) * 0.9
      );
      if (waterNormalTex) {
        waterTiling.set(3.5, 3.5, simTime * 0.04, simTime * 0.03);
        waterMat.tilingOffset = waterTiling;
      }
    }
    hudElapsed += deltaTime;
    if (hudElapsed >= 0.1) {
      hudElapsed = 0;
      syncHud();
    }
  };

  // Expose minimal verification helper for browser tests and World acceptance
  (window as unknown as Record<string, unknown>).__SSR_DEMO__ = {
    getDiagnostics: () => camera.screenSpaceReflectionDiagnostics,
    setQuality: applyQuality,
    setEnabled: applySsrEnabled,
    setHDR: applyHdr,
    setFrozen: applyFrozen,
    setPose: (p: DemoPoseKey) => {
      applyCameraPose(p, true);
      syncHud();
    },
    notifyCut: () => {
      camera.notifyScreenSpaceReflectionCut();
      syncHud();
    },
    setWaterfallContrib: applyWaterfallContrib
  };

  // Bake SkyProceduralMaterial once so IBL fallback, OptOutSphere, and SubmergedGlossyTile get genuine specular IBL.
  let iblBaker: RealtimeIBLBaker | null = null;
  if ((engine as unknown as { _hardwareRenderer?: { supportsRendering?: boolean } })._hardwareRenderer?.supportsRendering) {
    iblBaker = new RealtimeIBLBaker(scene, { resolution: 128, sampleCount: 64 });
    iblBaker.requestBake();
    while (!iblBaker.isIdle) {
      iblBaker.update();
    }
  }

  window.addEventListener(
    "beforeunload",
    () => {
      iblBaker?.destroy();
      iblBaker = null;
      engine.destroy();
    },
    { once: true }
  );

  applyCameraPose("overview", false);
  syncHud();
  engine.run();
  document.body.dataset.state = "ready";
}

bootstrap().catch((err) => {
  console.error("Failed to initialize SSR v2 showcase:", err);
  document.body.dataset.state = "error";
});
