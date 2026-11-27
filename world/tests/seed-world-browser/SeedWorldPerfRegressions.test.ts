import { expect, it, vi } from "vitest";
import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  Material,
  MeshRenderer,
  Shader,
  Sprite,
  Texture2D,
  TextureFormat,
  Vector4,
  WebGLEngine,
  type GLTFResource,
  type PBRMaterial
} from "@galacean/engine";
import { CanvasRenderMode, Image, Text, UICanvas, UITransform } from "@galacean/engine-ui";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  SEED_WORLD_VOICE_ORB_SHADER_NAME,
  SeedWorldLiquidGlassUiMaterial,
  seedWorldVoiceOrbShaderSource
} from "../../demos/seed-world/assistant/SeedWorldVoiceHudShaders";
import { RuntimeProjectSession } from "../../../packages/runtime-editor/src/project/runtime-project-session";
import { mountProjectSaveControl } from "../../../packages/runtime-editor/src/project/project-save-control";
import { ConfiguredAnimal } from "../../../packages/animals/src/gameplay/animal/ConfiguredAnimal";
import { AnimalSystem } from "../../../packages/animals/src/gameplay/animal/AnimalSystem";
import { createCuteZooToonMaterial } from "../../../packages/animals/src/gameplay/animal/CuteZooToonMaterial";
import { startSeedWorldAutoBench } from "../../demos/seed-world/src/SeedWorldAutoBench";
import { SeedWorldPerfPanel } from "../../demos/seed-world/src/SeedWorldPerfPanel";

async function makeEngine() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  document.body.append(canvas);
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  return { engine, canvas, scene: engine.sceneManager.activeScene! };
}

it.each(["open-failure", "read-failure"] as const)(
  "keeps HUD ephemeral and prompts beforeunload after IndexedDB %s, preserving durable save on reopen",
  async (failureMode) => {
    const { engine, canvas, scene } = await makeEngine();
    const id = "seed-world-idb-hud-" + crypto.randomUUID();
    const manifest = {
      scene: "Scene/main.scene",
      files: [{ type: "Scene", dependencies: [], virtualPath: "Scene/main.scene", path: "main.scene" }]
    };
    const open = () =>
      RuntimeProjectSession.open(id, manifest, location.href, {
        persistence: { debounceMs: 2500, maxWaitMs: 2500 }
      });
    const publish = (project: RuntimeProjectSession, text: string) =>
      project.publishAsset({ virtualPath: "notes.json", path: "notes.json", type: "JSON" }, text);
    const unloadPrevented = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    let closeHud: (() => void) | undefined;
    let project: RuntimeProjectSession | undefined;
    try {
      // Seed a real durable IndexedDB save first.
      project = await open();
      expect(project.isPersistent).toBe(true);
      await publish(project, '{"value":"durable-before-failure"}');
      await project.flush();
      project.dispose();
      project = undefined;

      // Inject either open() or readonly load() failure to force ephemeral in-memory fallback.
      const spy =
        failureMode === "open-failure"
          ? vi.spyOn(indexedDB, "open").mockImplementation(() => {
              throw new DOMException("Injected open failure", "SecurityError");
            })
          : (() => {
              const origTransaction = IDBDatabase.prototype.transaction;
              return vi
                .spyOn(IDBDatabase.prototype, "transaction")
                .mockImplementation(function (this: IDBDatabase, stores, mode, options) {
                  if (this.name === "galacean-runtime-projects" && mode === "readonly") {
                    throw new DOMException("Injected read failure", "AbortError");
                  }
                  return origTransaction.call(this, stores, mode, options);
                });
            })();
      try {
        project = await open();
      } finally {
        spy.mockRestore();
      }

      expect(project.isPersistent).toBe(false);
      expect(project.projectPackage.contents["notes.json"]).toBeUndefined();
      // Simulate real SeedWorldDemo pre-mount bootstrap migrations (which bump commitSeq before HUD mounts).
      await project.update(
        (pack) => ({
          ...pack,
          documents: { ...pack.documents, "Scene/main.scene.bootstrap.json": JSON.stringify({ version: 1 }) }
        }),
        { recordHistory: false }
      );
      expect(project.persistenceStatus.commitSeq).toBeGreaterThan(0);

      closeHud = mountProjectSaveControl(project, scene, canvas);
      const statusText = scene.findEntityByName("Project save status")!.getComponent(Text)!;
      expect(statusText.text).toBe("仅本次会话");
      // Read-only visit after pre-mount migrations must NOT falsely prompt beforeunload.
      expect(unloadPrevented()).toBe(false);

      // Simulate post-mount system bootstrap (e.g. initializeBuildingScene) + runtime clock checkpoint + save():
      // none of these are user edits, so beforeunload must remain quiet.
      const bootstrapDraft = structuredClone(project.projectPackage);
      bootstrapDraft.documents = { ...bootstrapDraft.documents, "Scene/main.scene.buildings.json": '{"init":true}' };
      await project.publish(bootstrapDraft, project.publicationRevision, [], undefined, { userEdit: false });
      const farmOwner = project.ownRuntimeAsset(
        { virtualPath: "World/Farming.json", path: "runtime-world:farming", type: "JSON", dependencies: [] },
        "owner"
      );
      await farmOwner.update(() => ({ content: '{"version":1,"farms":{}}', value: undefined, userEdit: false }));
      await project.save();
      expect(project.userEditSeq).toBe(0);
      expect(statusText.text).toBe("仅本次会话");
      expect(unloadPrevented()).toBe(false);
      farmOwner.dispose();

      // Edit and flush: HUD must stay "仅本次会话" (never "已保存") and beforeunload must still warn.
      await publish(project, '{"value":"ephemeral-after-failure"}');
      expect(project.userEditSeq).toBe(1);
      expect(statusText.text).toBe("仅本次会话");
      expect(unloadPrevented()).toBe(true);
      await project.flush();
      expect(statusText.text).toBe("仅本次会话");
      expect(unloadPrevented()).toBe(true);

      // Reopen once IndexedDB recovers: original durable save remains intact.
      closeHud();
      closeHud = undefined;
      project.dispose();
      project = await open();
      expect(project.isPersistent).toBe(true);
      expect(project.projectPackage.contents["notes.json"]).toBe('{"value":"durable-before-failure"}');
    } finally {
      closeHud?.();
      project?.dispose();
      engine.destroy();
      canvas.remove();
    }
  }
);

function makeGltf() {
  const floats = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0.1, 0]);
  const geometry =
    "data:application/octet-stream;base64," + btoa(String.fromCharCode(...new Uint8Array(floats.buffer)));
  return {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "model", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { roughnessFactor: 0.25, metallicFactor: 0.6 } }],
    buffers: [{ uri: geometry, byteLength: floats.byteLength }],
    bufferViews: [
      { buffer: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 8 },
      { buffer: 0, byteOffset: 44, byteLength: 24 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 2, componentType: 5126, count: 2, type: "VEC3" }
    ],
    animations: [
      {
        name: "idle",
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
        samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }]
      }
    ]
  };
}

it("does not mutate shared GLTF material SSR settings when creating or disposing ConfiguredAnimal", async () => {
  const { engine, canvas, scene } = await makeEngine();
  const url = URL.createObjectURL(new Blob([JSON.stringify(makeGltf())], { type: "model/gltf+json" }));
  const system = new AnimalSystem();
  try {
    const resource = await engine.resourceManager.load<GLTFResource>({ url, type: AssetType.GLTF });
    const host = scene.createRootEntity("host");
    const independent = resource.instantiateSceneRoot();
    host.addChild(independent);
    const shared = independent.getComponentsIncludeChildren(MeshRenderer, [])[0].getMaterial()! as PBRMaterial;
    expect(shared).toBe(resource.materials![0]);
    expect(shared.screenSpaceReflectionIntensity).toBe(1);
    expect(shared._canReceiveScreenSpaceReflection(0.6)).toBe(true);

    const eye = host.createChild("camera");
    eye.transform.setPosition(0, 0, 4);
    const camera = eye.addComponent(Camera);
    scene.screenSpaceReflection.enabled = true;
    camera.render();
    expect(camera.screenSpaceReflectionDiagnostics.opaqueReceiverCount).toBe(1);

    const bounds = { min: [-1, -1, 0], max: [1, 1, 0] } as const;
    const config = {
      id: "animal",
      name: "Fixture",
      family: "test",
      modelUrl: url,
      scale: 1,
      bounds,
      animations: [{ id: "idle", clip: "idle", duration: 1, loop: true, bounds }],
      aliases: [],
      note: "",
      initialAnimation: "idle"
    };
    const profile = {
      defaultSkill: "idle",
      skills: { idle: { label: "Idle", tree: { type: "action", name: "animate", params: { slot: "idle" } } } },
      animationSlots: { idle: [{ clip: "idle", weight: 1, medium: "ground" }] },
      movementSpeeds: {},
      reactions: {}
    } as const;
    const create = (options = {}) =>
      new ConfiguredAnimal(host, config, resource, system, [0, 0], profile, () => null, undefined, 0, options);

    const toon = createCuteZooToonMaterial(shared);
    try {
      expect(toon.screenSpaceReflectionIntensity).toBe(0);
      create({ resolveMaterial: () => toon }).dispose();
      expect(shared.screenSpaceReflectionIntensity).toBe(1);

      // Borrowing path without resolveMaterial or material correction must also leave shared SSR intact.
      const borrowedAnimal = create();
      expect(shared.screenSpaceReflectionIntensity).toBe(1);
      expect(shared._canReceiveScreenSpaceReflection(0.6)).toBe(true);
      camera.render();
      expect(camera.screenSpaceReflectionDiagnostics.opaqueReceiverCount).toBeGreaterThanOrEqual(1);

      borrowedAnimal.dispose();
      expect(shared.screenSpaceReflectionIntensity).toBe(1);
      expect(shared._canReceiveScreenSpaceReflection(0.6)).toBe(true);
      camera.render();
      expect(camera.screenSpaceReflectionDiagnostics.opaqueReceiverCount).toBe(1);
    } finally {
      toon.destroy();
    }
  } finally {
    system.dispose();
    engine.destroy();
    canvas.remove();
    URL.revokeObjectURL(url);
  }
});

it.each([true, false])(
  "preserves user perf-panel toggles, custom DPR, and matching start/end ablation baselines (building=%s)",
  async (startsEnabled) => {
    const { engine, scene, canvas } = await makeEngine();
    const root = scene.createRootEntity("test world");
    const building = root.createChild("test buildings");
    const camera = root.createChild().addComponent(Camera);
    const sun = root.createChild().addComponent(DirectLight);
    let dpr: number | null = null;
    const noop = () => {};
    const panel = new SeedWorldPerfPanel({
      engine,
      scene,
      canvas,
      camera,
      sun,
      root,
      post: {
        getDebugSnapshot: () => ({
          enabled: true,
          bloom: { enabled: true },
          tonemapping: true,
          colorAdjustments: { enabled: true },
          sunLensFlare: { enabled: true }
        }),
        setProfileEnabled: noop,
        setBloomEnabled: noop,
        setTonemappingEnabled: noop,
        setColorAdjustmentsEnabled: noop,
        setSunLensFlareEnabled: noop
      },
      wind: { enabled: true },
      environment: {
        weatherSystem: { state: { cloud: { cloudCoverage: 0 } } },
        invalidateCloudHistory: noop,
        update: noop
      },
      readPublished: () => undefined,
      setBuildingVisible: (on) => {
        building.isActive = on;
      },
      setDprOverride: (value) => {
        dpr = value;
      },
      setVistaVisible: noop,
      getVistaVisible: () => true,
      setHudVisible: noop,
      suppressAutoBoot: true
    } as any);

    const panelElement = document.querySelector("[data-seed-world-perf-panel='1']")!;
    const buildingButton = panelElement.querySelector<HTMLButtonElement>("[data-toggle-key='building']")!;
    const dprButton = [...panelElement.querySelectorAll("button")].find((b) =>
      b.textContent!.includes("渲染分辨率 DPR")
    )!;
    if (!startsEnabled) {
      buildingButton.click();
      dprButton.click();
    }
    const expectedDpr = startsEnabled ? null : 1.5;
    expect(building.isActive).toBe(startsEnabled);
    expect(panel.isModuleEnabled("building")).toBe(startsEnabled);
    expect(dpr).toBe(expectedDpr);
    expect(panel.getDpr()).toBe(expectedDpr);

    let now = performance.now();
    let nextId = 0;
    let frames = 0;
    let draws = 0;
    const raf = new Map<number, FrameRequestCallback>();
    const samples: Array<{ buildingOn: boolean; dpr: number | null }> = [];
    const requests: any[] = [];
    const abort = new AbortController();
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      raf.set(++nextId, cb);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.delete(id));
    vi.spyOn(window, "fetch").mockImplementation(async (url, init) => {
      expect(url).toBe("/__mobile-diag");
      requests.push(JSON.parse(init!.body as string));
      return new Response(null, { status: 200 });
    });

    const handle = startSeedWorldAutoBench({
      durationSec: 4,
      camera,
      navigation: { eyeHeight: 1.7, setInputEnabled: noop, synchronizeView: noop } as any,
      bgWarmupDone: Promise.resolve(),
      readPlan: () => undefined,
      sampleHeight: () => 0,
      isWater: () => false,
      runCapture: noop,
      ablate: {
        autoStart: true,
        canvas,
        setModule: (key, on) => panel.setModuleEnabled(key, on),
        getModule: (key) => panel.isModuleEnabled(key),
        setSubGroup: (key, on) => panel.setSubGroupVisible(key, on),
        getSubGroup: (key) => panel.isSubGroupVisible(key),
        setDpr: (value) => panel.setDpr(value),
        getDpr: () => panel.getDpr(),
        readCounters: (out) => {
          samples.push({ buildingOn: building.isActive, dpr });
          out.frames = frames;
          out.dc = draws;
          return out;
        }
      },
      signal: abort.signal
    });

    try {
      for (let t = 0; t < 3100 && !requests.length; t++) {
        now += 16.67;
        frames++;
        draws += building.isActive ? 100 : 25;
        const entries = [...raf.values()];
        raf.clear();
        for (const cb of entries) cb(now);
        for (let i = 0; i < 6; i++) await Promise.resolve();
      }
      expect(requests).toHaveLength(1);
      const expectedDc = startsEnabled ? 100 : 25;
      expect(requests[0].steps[0]).toMatchObject({ id: "baseline_start", dc: expectedDc });
      expect(requests[0].steps.at(-1)).toMatchObject({ id: "baseline_end", dc: expectedDc });
      expect(samples[0]).toEqual({ buildingOn: startsEnabled, dpr: expectedDpr });
      expect(samples.at(-1)).toEqual({ buildingOn: startsEnabled, dpr: expectedDpr });
      expect(building.isActive).toBe(startsEnabled);
      expect(panel.isModuleEnabled("building")).toBe(startsEnabled);
      expect(dpr).toBe(expectedDpr);
      expect(panel.getDpr()).toBe(expectedDpr);
    } finally {
      abort.abort();
      handle.dispose();
      panel.dispose();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      engine.destroy();
      canvas.remove();
    }
  }
);

it("restores non-default user toggles and custom DPR when ablation is aborted mid-run", async () => {
  const { engine, scene, canvas } = await makeEngine();
  const root = scene.createRootEntity("test world");
  const building = root.createChild("test buildings");
  const camera = root.createChild().addComponent(Camera);
  const sun = root.createChild().addComponent(DirectLight);
  let dpr: number | null = null;
  const noop = () => {};
  const panel = new SeedWorldPerfPanel({
    engine,
    scene,
    canvas,
    camera,
    sun,
    root,
    post: {
      getDebugSnapshot: () => ({
        enabled: true,
        bloom: { enabled: true },
        tonemapping: true,
        colorAdjustments: { enabled: true },
        sunLensFlare: { enabled: true }
      }),
      setProfileEnabled: noop,
      setBloomEnabled: noop,
      setTonemappingEnabled: noop,
      setColorAdjustmentsEnabled: noop,
      setSunLensFlareEnabled: noop
    },
    wind: { enabled: true },
    environment: {
      weatherSystem: { state: { cloud: { cloudCoverage: 0 } } },
      invalidateCloudHistory: noop,
      update: noop
    },
    readPublished: () => undefined,
    setBuildingVisible: (on) => {
      building.isActive = on;
    },
    setDprOverride: (value) => {
      dpr = value;
    },
    setVistaVisible: noop,
    getVistaVisible: () => true,
    setHudVisible: noop,
    suppressAutoBoot: true
  } as any);

  panel.setModuleEnabled("building", false);
  panel.setDpr(1.5);
  expect(building.isActive).toBe(false);
  expect(dpr).toBe(1.5);

  let now = performance.now();
  let nextId = 0;
  let frames = 0;
  const raf = new Map<number, FrameRequestCallback>();
  const abort = new AbortController();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    raf.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.delete(id));

  const handle = startSeedWorldAutoBench({
    durationSec: 4,
    camera,
    navigation: { eyeHeight: 1.7, setInputEnabled: noop, synchronizeView: noop } as any,
    bgWarmupDone: Promise.resolve(),
    readPlan: () => undefined,
    sampleHeight: () => 0,
    isWater: () => false,
    runCapture: noop,
    ablate: {
      autoStart: true,
      canvas,
      setModule: (key, on) => panel.setModuleEnabled(key, on),
      getModule: (key) => panel.isModuleEnabled(key),
      setSubGroup: (key, on) => panel.setSubGroupVisible(key, on),
      getSubGroup: (key) => panel.isSubGroupVisible(key),
      setDpr: (value) => panel.setDpr(value),
      getDpr: () => panel.getDpr(),
      readCounters: (out) => {
        out.frames = frames;
        return out;
      }
    },
    signal: abort.signal
  });

  try {
    // Advance halfway into the ablation sequence (including into DPR/module steps), then abort.
    for (let t = 0; t < 2600; t++) {
      now += 16.67;
      frames++;
      const entries = [...raf.values()];
      raf.clear();
      for (const cb of entries) cb(now);
      for (let i = 0; i < 6; i++) await Promise.resolve();
      if (dpr === 1) {
        abort.abort();
        for (let i = 0; i < 6; i++) await Promise.resolve();
        break;
      }
    }
    expect(abort.signal.aborted).toBe(true);
    expect(building.isActive).toBe(false);
    expect(panel.isModuleEnabled("building")).toBe(false);
    expect(dpr).toBe(1.5);
    expect(panel.getDpr()).toBe(1.5);
  } finally {
    abort.abort();
    handle.dispose();
    panel.dispose();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    engine.destroy();
    canvas.remove();
  }
});

it("animates VoiceOrb and LiquidGlass scaling via GPU vertex uniforms with zero chunkUI uploads/orphans and verified pixel expansion", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  document.body.append(canvas);
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const scene = engine.sceneManager.activeScene!;
  scene.background.solidColor.set(0, 0, 0, 1);
  const root = scene.createRootEntity("voice-orb-gpu-scale-root");
  const cameraEntity = root.createChild("world-cam");
  const camera = cameraEntity.addComponent(Camera);

  const uiRoot = root.createChild("ui-root");
  const uiCanvas = uiRoot.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  uiCanvas.camera = camera;
  uiCanvas.referenceResolution.set(256, 256);

  const whiteTex = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false);
  whiteTex.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  const whiteSprite = new Sprite(engine, whiteTex);

  const orbGlass = new SeedWorldLiquidGlassUiMaterial(camera);
  orbGlass.setFullLensRefraction(1);
  orbGlass.setOpacity(1);
  orbGlass.setLayout(80, 80, 40);

  const orbShader = Shader.find(SEED_WORLD_VOICE_ORB_SHADER_NAME) ?? Shader.create(seedWorldVoiceOrbShaderSource);
  const orbMat = new Material(engine, orbShader);
  orbMat.shaderData.setFloat("material_Time", 0);
  orbMat.shaderData.setFloat("material_Listening", 0);
  orbMat.shaderData.setFloat("material_OrbScaleExpandPixels", 0);
  orbMat.shaderData.setVector4("material_OrbCyan", new Vector4(24 / 255, 244 / 255, 1, 1));
  orbMat.shaderData.setVector4("material_OrbAzure", new Vector4(85 / 255, 126 / 255, 1, 1));
  orbMat.shaderData.setVector4("material_OrbViolet", new Vector4(141 / 255, 98 / 255, 1, 1));
  orbMat.shaderData.setVector4("material_OrbOrchid", new Vector4(230 / 255, 98 / 255, 1, 1));
  orbMat.shaderData.setVector4("material_OrbRose", new Vector4(1, 110 / 255, 224 / 255, 1));
  orbMat.shaderData.setVector4("material_OrbCore", new Vector4(1, 1, 1, 1));
  orbMat.shaderData.setVector4("material_OrbMotion", new Vector4(0.87, 1.58, 0.19, 0.88));
  orbMat.shaderData.setVector4("material_OrbRibbon", new Vector4(1.02, 0.39, 1.45, 1.38));
  orbMat.shaderData.setVector4("material_OrbDisp", new Vector4(0.032, 0.04, 0.4, 0));
  orbMat.shaderData.setVector4("material_OrbTone", new Vector4(1.13, 1.22, 0.92, 0.82));
  orbMat.shaderData.setVector4("material_OrbRim", new Vector4(0.36, 0.055, 0.18, 0.55));
  orbMat.shaderData.setFloat("material_OrbShellThickness", 0.025);

  const orbEntity = uiRoot.createChild("Siri voice orb");
  const orbTransform = orbEntity.transform as UITransform;
  orbTransform.size.set(80, 80);
  const orbGlassImage = orbEntity.addComponent(Image);
  orbGlassImage.sprite = whiteSprite;
  orbGlassImage.color = new Color(1, 1, 1, 1);
  orbGlassImage.setMaterial(orbGlass.material);

  const orbVisualEntity = orbEntity.createChild("Siri voice orb visual");
  const orbVisualTransform = orbVisualEntity.transform as UITransform;
  orbVisualTransform.size.set(80, 80);
  const orbVisualImage = orbVisualEntity.addComponent(Image);
  orbVisualImage.sprite = whiteSprite;
  orbVisualImage.color = new Color(1, 1, 1, 1);
  orbVisualImage.setMaterial(orbMat);

  try {
    // Warm up 2 frames so chunkUI uploads initial quad vertices once and compiles both shaders.
    engine.update();
    engine.update();

    const chunkUI = engine._batcherManager.primitiveChunkManagerUI.primitiveChunks[0];
    expect(chunkUI).toBeDefined();
    expect((chunkUI as any)._vboBindings.length).toBe(1);
    expect((chunkUI as any)._iboBindings.length).toBe(1);

    const gl = (engine._hardwareRenderer as any).gl as WebGL2RenderingContext;
    const samplePixel = (x: number, y: number): [number, number, number, number] => {
      const px = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return [px[0], px[1], px[2], px[3]];
    };

    // At scale 1.0 (80x80 centered at (128,128) -> radius 40px): all 4 cardinal points at ±52px are outside (black).
    const cardinalPoints: Array<[number, number]> = [
      [180, 128],
      [76, 128],
      [128, 180],
      [128, 76]
    ];
    for (const [x, y] of cardinalPoints) {
      const px = samplePixel(x, y);
      expect(px[0] + px[1] + px[2]).toBe(0);
    }

    const bufferDataSpy = vi.spyOn(gl, "bufferData");
    const bufferSubDataSpy = vi.spyOn(gl, "bufferSubData");
    const createVaoSpy = vi.spyOn(gl, "createVertexArray");
    const deleteVaoSpy = vi.spyOn(gl, "deleteVertexArray");

    // Run 20 idle breathing frames + 10 pressed-expansion frames purely via shader uniforms.
    for (let f = 0; f < 30; f++) {
      const scale = f < 20 ? 1 + Math.sin(f * 0.4) * 0.025 : 1.72;
      const expandPx = 80 * (scale - 1);
      orbMat.shaderData.setFloat("material_Time", f * 0.05);
      orbMat.shaderData.setFloat("material_OrbScaleExpandPixels", expandPx);
      orbGlass.setQuadExpandPixels(expandPx, expandPx);
      orbGlass.setLayout(80 * scale, 80 * scale, 40 * scale);
      engine.update();
    }

    // At 1.72x GPU vertex expansion (radius ~68.8px), all 4 cardinal points at ±52px are now symmetrically inside!
    for (const [x, y] of cardinalPoints) {
      const px = samplePixel(x, y);
      expect(px[0] + px[1] + px[2]).toBeGreaterThan(20);
    }

    // Zero CPU VBO/IBO uploads, zero Discard orphans, zero VAO thrashing across all 30 animated frames!
    const vboIboOrphans = bufferDataSpy.mock.calls.filter(
      ([target]) => target === gl.ARRAY_BUFFER || target === gl.ELEMENT_ARRAY_BUFFER
    );
    const vboIboUploads = bufferSubDataSpy.mock.calls.filter(
      ([target]) => target === gl.ARRAY_BUFFER || target === gl.ELEMENT_ARRAY_BUFFER
    );
    expect(vboIboOrphans.length).toBe(0);
    expect(vboIboUploads.length).toBe(0);
    expect(createVaoSpy).not.toHaveBeenCalled();
    expect(deleteVaoSpy).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    orbGlass.destroy();
    orbMat.destroy();
    whiteSprite.destroy();
    whiteTex.destroy();
    engine.destroy();
    canvas.remove();
  }
});

it("rotates PrimitiveChunk 3-frame VBO/IBO slots in modified WebGL2 RHI with zero Discard orphans, zero VAO thrashing, and zero leaks", async () => {
  const { engine, canvas, scene } = await makeEngine();
  const root = scene.createRootEntity("ring-ui-root");
  root.createChild("cam").addComponent(Camera);

  const uiCanvas = root.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  const tex = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false);
  tex.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  const sprite = new Sprite(engine, tex);

  const movingEntity = root.createChild("moving-ui");
  const movingTransform = movingEntity.transform as UITransform;
  movingTransform.size.set(32, 32);
  const img = movingEntity.addComponent(Image);
  img.sprite = sprite;

  const gl = (engine._hardwareRenderer as any).gl as WebGL2RenderingContext;
  try {
    // Warm up 3 dynamic frames so the 3-slot VBO ring and per-slot VAOs in modified GLPrimitive are all initialized.
    for (let f = 1; f <= 3; f++) {
      movingTransform.setPosition(f * 2, 0, 0);
      engine.update();
    }

    const chunkUI = engine._batcherManager.primitiveChunkManagerUI.primitiveChunks[0];
    expect((chunkUI as any)._vboBindings.length).toBe(3);
    expect((chunkUI as any)._iboBindings.length).toBe(1);
    const vaoMap: Map<number, unknown> = (chunkUI.primitive as any)._platformPrimitive._vaoMap;
    expect(vaoMap.size).toBe(3);

    const bufferDataSpy = vi.spyOn(gl, "bufferData");
    const bufferSubDataSpy = vi.spyOn(gl, "bufferSubData");
    const createVaoSpy = vi.spyOn(gl, "createVertexArray");
    const deleteVaoSpy = vi.spyOn(gl, "deleteVertexArray");

    // 10 more consecutive animated UI frames: 0 Discard orphans, 0 VAO create/delete, exact 10 VBO subData uploads!
    for (let f = 4; f <= 13; f++) {
      movingTransform.setPosition(f * 2, 0, 0);
      engine.update();
    }

    const vboIboOrphans = bufferDataSpy.mock.calls.filter(
      ([target]) => target === gl.ARRAY_BUFFER || target === gl.ELEMENT_ARRAY_BUFFER
    );
    const vboSubDataUploads = bufferSubDataSpy.mock.calls.filter(([target]) => target === gl.ARRAY_BUFFER);
    expect(vboIboOrphans.length).toBe(0);
    expect(vboSubDataUploads.length).toBe(10);
    expect(createVaoSpy).not.toHaveBeenCalled();
    expect(deleteVaoSpy).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.NO_ERROR);

    const vboSlots = (chunkUI as any)._vboBindings.map((b: any) => b.buffer);
    const iboSlots = (chunkUI as any)._iboBindings.map((b: any) => b.buffer);
    const deletedBeforeDestroy = deleteVaoSpy.mock.calls.length;
    engine._batcherManager.destroy();
    expect(deleteVaoSpy.mock.calls.length - deletedBeforeDestroy).toBe(3);
    expect(vaoMap.size).toBe(0);
    for (const buf of [...vboSlots, ...iboSlots]) {
      expect(buf.destroyed).toBe(true);
    }
  } finally {
    sprite.destroy();
    tex.destroy();
    engine.destroy();
    canvas.remove();
  }
});
