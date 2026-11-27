import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createdTextures: [] as Array<{ width: number; height: number; isGCIgnored: boolean; destroyed: boolean }>,
  createdTargets: [] as Array<{ width: number; height: number; destroyed: boolean }>,
  createdMeshes: [] as Array<{ name: string; destroyed: boolean }>,
  createdAudioSources: [] as Array<{
    playOnEnabled: boolean;
    loop: boolean;
    spatial: boolean;
    volume: number;
    clip: any;
    playCalls: Array<number | undefined>;
    stopCalls: number;
    destroyed: boolean;
  }>,
  audioResumeCalls: 0,
  throwOnRenderTarget: false,
  onStrokeWarmup: undefined as (() => Promise<void> | void) | undefined
}));

vi.mock("@galacean/engine", () => {
  class Vector2 {
    constructor(public x = 0, public y = 0) {}
  }
  class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
  }
  class Vector4 {
    constructor(public x = 0, public y = 0, public z = 0, public w = 0) {}
    set(x: number, y: number, z: number, w: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
    }
  }
  class Color {
    constructor(public r = 0, public g = 0, public b = 0, public a = 1) {}
    set(r: number, g: number, b: number, a: number) {
      this.r = r;
      this.g = g;
      this.b = b;
      this.a = a;
    }
    static gammaToLinearSpace(v: number) {
      return v;
    }
  }
  class Texture2D {
    isGCIgnored = false;
    wrapModeU = 0;
    wrapModeV = 0;
    filterMode = 0;
    destroyed = false;
    constructor(
      public engine: any,
      public width: number,
      public height: number
    ) {
      state.createdTextures.push(this);
    }
    setPixelBuffer() {}
    setImageSource() {}
    destroy() {
      this.destroyed = true;
    }
  }
  class RenderTarget {
    destroyed = false;
    constructor(
      public engine: any,
      public width: number,
      public height: number
    ) {
      if (state.throwOnRenderTarget) {
        throw new Error("Simulated RenderTarget FBO allocation failure");
      }
      state.createdTargets.push(this);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class ModelMesh {
    bounds = { min: { set() {} }, max: { set() {} } };
    destroyed = false;
    constructor(
      public engine?: any,
      public name = ""
    ) {
      state.createdMeshes.push(this);
    }
    setPositions() {}
    setUVs() {}
    setColors() {}
    setIndices() {}
    addSubMesh() {}
    uploadData() {}
    destroy() {
      this.destroyed = true;
    }
  }
  class Material {
    shaderData = {
      setTexture() {},
      setVector4() {}
    };
    destroy() {}
  }
  class UnlitMaterial extends Material {
    renderFace = 0;
    isTransparent = false;
    baseTexture: any = null;
    baseColor = new Color();
  }
  class MeshRenderer {
    mesh: any = null;
    castShadows = false;
    receiveShadows = false;
    destroyed = false;
    entity: any;
    private _material: any = null;
    constructor(entity: any) {
      this.entity = entity;
    }
    setMaterial(material: any) {
      this._material = material;
    }
    getMaterial() {
      return this._material;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  class CameraStub {
    isOrthographic = false;
    orthographicSize = 1;
    aspectRatio = 1;
    nearClipPlane = 0.1;
    farClipPlane = 100;
    clearFlags = 0;
    cullingMask = 0;
    priority = 0;
    enabled = false;
    enableHDR = false;
    enablePostProcess = false;
    enableScreenSpaceReflection = false;
    destroyed = false;
    private _viewport: { x: number; y: number } | null = { x: 0, y: 0 };
    private _renderTarget: any = null;
    constructor(public entity: any) {}
    get renderTarget() {
      return this._renderTarget;
    }
    set renderTarget(value: any) {
      this._renderTarget = value;
      // Mirror real Galacean Camera._adjustPixelViewport accessing this._viewport.x on destroyed camera.
      void this._viewport!.x;
    }
    render() {}
    destroy() {
      this.destroyed = true;
      this._viewport = null;
    }
  }
  class TextRendererStub {
    text = "";
    font: any;
    fontSize = 14;
    color = new Color();
    enableWrapping = false;
    horizontalAlignment = 0;
    verticalAlignment = 0;
    entity: any;
    constructor(entity: any) {
      this.entity = entity;
    }
    destroy() {}
  }
  class ScriptStub {
    entity: any;
    constructor(entity: any) {
      this.entity = entity;
    }
    destroy() {}
  }
  class AudioClipStub {
    constructor(
      public engine?: any,
      public name = ""
    ) {}
  }
  class AudioSourceStub {
    playOnEnabled = true;
    loop = false;
    spatial = false;
    volume = 1;
    clip: any = null;
    playCalls: Array<number | undefined> = [];
    stopCalls = 0;
    destroyed = false;
    constructor(public entity: any) {
      state.createdAudioSources.push(this);
    }
    play(offset?: number) {
      this.playCalls.push(offset);
    }
    stop() {
      this.stopCalls++;
    }
    destroy() {
      this.destroyed = true;
      this.clip = null;
    }
  }
  const AudioManagerStub = {
    resume() {
      state.audioResumeCalls++;
      return Promise.resolve();
    }
  };
  class EntityStub {
    layer = 0;
    isActive = true;
    destroyed = false;
    children: EntityStub[] = [];
    components: any[] = [];
    transform = {
      setPosition() {},
      setScale() {}
    };
    constructor(public name = "") {}
    createChild(name = "") {
      const child = new EntityStub(name);
      this.children.push(child);
      return child;
    }
    addComponent(Ctor: any) {
      const component = new Ctor(this);
      this.components.push(component);
      return component;
    }
    getComponentsIncludeChildren() {
      return [];
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const c of this.components) c.destroy?.();
      for (const child of this.children) child.destroy();
    }
  }
  class SceneStub {
    rootEntities: EntityStub[] = [];
    background = { mode: 0, solidColor: new Color() };
    ambientLight = { destroy() {} };
    destroyed = false;
    constructor(
      public engine?: any,
      public name = ""
    ) {}
    createRootEntity(name = "") {
      const e = new EntityStub(name);
      this.rootEntities.push(e);
      return e;
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const root of this.rootEntities) root.destroy();
    }
  }
  return {
    AssetType: { Audio: "Audio" },
    AudioClip: AudioClipStub,
    AudioManager: AudioManagerStub,
    AudioSource: AudioSourceStub,
    BackgroundMode: { SolidColor: 0 },
    BaseMaterial: Material,
    Camera: CameraStub,
    CameraClearFlags: { Depth: 2, Color: 1 },
    Color,
    Entity: EntityStub,
    Font: { createFromOS: () => ({}) },
    Layer: { Layer25: 1 << 25 },
    Material,
    MeshRenderer,
    ModelMesh,
    PrimitiveMesh: {
      createPlane: (engine: any) => new ModelMesh(engine, "plane"),
      createCuboid: (engine: any) => new ModelMesh(engine, "cuboid")
    },
    RenderFace: { Double: 2 },
    RenderTarget,
    Scene: SceneStub,
    Script: ScriptStub,
    Shader: { find: () => ({}), create: () => ({}) },
    TextRenderer: TextRendererStub,
    Texture2D,
    TextureFilterMode: { Bilinear: 1 },
    TextureFormat: { R8G8B8A8_UNorm: 0 },
    TextureWrapMode: { Clamp: 0 },
    UnlitMaterial,
    Vector2,
    Vector3,
    Vector4
  };
});

vi.mock("@galacean/engine-project/geometry/destroyOwnedMesh", () => ({
  destroyOwnedMesh(mesh?: { destroy?: () => void }) {
    mesh?.destroy?.();
  }
}));
vi.mock("../src/world/SeedWorldPhotoWarmup", () => ({
  warmupPhotoPresentation: vi.fn(async () => {})
}));
vi.mock("../src/world/SeedWorldShaderWarmup", () => ({
  warmupSeedWorldRendererVariants: vi.fn(async () => {
    await state.onStrokeWarmup?.();
  })
}));

import { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { Entity, Scene, Texture2D } from "@galacean/engine";
import { PhotoGraphics, PhotoSurface } from "../src/world/SeedWorldPhotoGraphics";
import {
  SEED_WORLD_VOICE_ORB_LAYOUT,
  photoDetailLayout,
  resolveSeedWorldVoiceOrbLayout
} from "../src/world/SeedWorldPhotoPalette";

function createFakeGraphics(budget: ImageResourceBudget) {
  const engine = {} as any;
  const workspaceRoot = new (Entity as any)("workspace");
  return {
    engine,
    budget,
    workspaceRoot,
    emptyStrokeMaskTexture: new Texture2D(engine, 1, 1),
    closeButtonTexture: new Texture2D(engine, 1, 1),
    tagWorkspaceEntity() {},
    renderStrokeField: vi.fn()
  } as any;
}

describe("PhotoSurface stroke mask lifecycle & failure cleanup", () => {
  it("lazily allocates and disposes strokeMaskTarget without charging ImageResourceBudget even when budget is full", () => {
    state.createdTextures.length = 0;
    state.createdTargets.length = 0;
    state.throwOnRenderTarget = false;

    // Exhaust the entire ImageResourceBudget to verify freehand drawing is completely decoupled from image budget.
    const budget = new ImageResourceBudget(1024);
    const releaseAll = budget.reserve("image", 1024);
    const graphics = createFakeGraphics(budget);
    const image = {
      texture: new Texture2D({} as any, 768, 480),
      width: 768,
      height: 480,
      export: async () => {
        throw new Error("unused");
      },
      dispose() {}
    };

    const surface = new PhotoSurface(graphics, image as any);
    const texturesBefore = state.createdTextures.length;
    expect(budget.stats.display).toBe(0);

    surface.paint([{ points: [{ x: 10, y: 10 }, { x: 120, y: 90 }], width: 6, color: "#ff453a" }]);
    expect(budget.stats.display).toBe(0);
    expect(state.createdTextures.length).toBe(texturesBefore + 1);
    expect(state.createdTargets.length).toBe(1);
    expect(graphics.renderStrokeField).toHaveBeenCalledTimes(1);

    // Subsequent paints reuse the allocated RenderTarget without allocating another texture/target.
    surface.paint([{ points: [{ x: 20, y: 20 }, { x: 160, y: 140 }], width: 6, color: "#ff453a" }]);
    expect(state.createdTextures.length).toBe(texturesBefore + 1);
    expect(state.createdTargets.length).toBe(1);

    surface.dispose();
    expect(state.createdTextures.at(-1)!.destroyed).toBe(true);
    expect(state.createdTargets[0]!.destroyed).toBe(true);
    releaseAll();
    expect(budget.stats.total).toBe(0);
  });

  it("renders onboarding hint circle via renderStrokeField without redundant redraws during pulse/fade and never clobbers user marks", () => {
    state.createdTextures.length = 0;
    state.createdTargets.length = 0;
    state.throwOnRenderTarget = false;

    const budget = new ImageResourceBudget(1024);
    const graphics = createFakeGraphics(budget);
    const image = {
      texture: new Texture2D({} as any, 480, 768),
      width: 480,
      height: 768,
      export: async () => {
        throw new Error("unused");
      },
      dispose() {}
    };

    const surface = new PhotoSurface(graphics, image as any);
    surface.setFrameLayout(380, 608, 20, 0);
    expect(surface.hasUserMarks).toBe(false);

    // Mid-sweep bakes into strokeMaskTarget through the exact real brush pipeline.
    surface.setHintLoop(0.5, 1.0);
    expect(graphics.renderStrokeField).toHaveBeenCalledTimes(1);
    expect(surface.hasUserMarks).toBe(false);

    // Closing bakes once; subsequent pulse & fade frames at progress=1 must NOT trigger any extra GPU redraws.
    surface.setHintLoop(1.0, 1.0);
    expect(graphics.renderStrokeField).toHaveBeenCalledTimes(2);
    surface.setHintLoop(1.0, 0.86);
    surface.setHintLoop(1.0, 0.45);
    surface.setHintLoop(1.0, 0.12);
    expect(graphics.renderStrokeField).toHaveBeenCalledTimes(2);

    // User draws a real stroke; a late stopOnboardingHint -> setHintLoop(0, 0) must never wipe user marks.
    surface.paint([{ points: [{ x: 40, y: 40 }, { x: 200, y: 180 }], width: 3.8, color: "#ff453a" }]);
    expect(graphics.renderStrokeField).toHaveBeenCalledTimes(3);
    const brushParamsAfterPaint = (surface as any).brushParams.y;
    expect(brushParamsAfterPaint).toBe(1);

    surface.setHintLoop(0, 0);
    expect((surface as any).brushParams.y).toBe(1);
    expect(surface.hasUserMarks).toBe(true);
    surface.paint([]);
    expect(surface.hasUserMarks).toBe(false);
    surface.dispose();
  });

  it("destroys the newly created isGCIgnored Texture2D if RenderTarget construction throws", () => {
    state.createdTextures.length = 0;
    state.createdTargets.length = 0;
    state.throwOnRenderTarget = false;

    const budget = new ImageResourceBudget(10 * 1024 * 1024);
    const graphics = createFakeGraphics(budget);
    const image = {
      texture: new Texture2D({} as any, 768, 480),
      width: 768,
      height: 480,
      export: async () => {
        throw new Error("unused");
      },
      dispose() {}
    };

    const surface = new PhotoSurface(graphics, image as any);
    const textureCountBefore = state.createdTextures.length;
    state.throwOnRenderTarget = true;

    try {
      expect(() =>
        surface.paint([{ points: [{ x: 10, y: 10 }, { x: 120, y: 90 }], width: 6, color: "#ff453a" }])
      ).toThrow("Simulated RenderTarget FBO allocation failure");

      expect(state.createdTextures.length).toBe(textureCountBefore + 1);
      const failedMaskTex = state.createdTextures.at(-1)!;
      expect(failedMaskTex.isGCIgnored).toBe(true);
      expect(failedMaskTex.destroyed).toBe(true);
      expect(budget.stats.display).toBe(0);
      expect(budget.stats.total).toBe(0);
    } finally {
      state.throwOnRenderTarget = false;
      surface.dispose();
    }
  });

  it("rejects with AbortError and frees all stroke warmup GPU resources when dispose() runs during prepare()", async () => {
    state.createdTextures.length = 0;
    state.createdTargets.length = 0;
    state.createdMeshes.length = 0;
    state.throwOnRenderTarget = false;

    const mainScene = new (Scene as any)({}, "main");
    const engine: any = {
      canvas: { width: 800, height: 600 },
      sceneManager: {
        addScene() {},
        removeScene() {}
      }
    };
    const worldCamera: any = {
      scene: mainScene,
      cullingMask: -1,
      priority: 0,
      destroyed: false
    };
    const canvas: any = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    };
    const graphics = new PhotoGraphics(engine, canvas, worldCamera, () => {});
    const texturesBeforePrepare = state.createdTextures.length;
    const targetsBeforePrepare = state.createdTargets.length;
    const meshesBeforePrepare = state.createdMeshes.length;

    let releaseWarmup!: () => void;
    let enteredStrokeWarmup!: () => void;
    const strokeWarmupEntered = new Promise<void>((resolve) => {
      enteredStrokeWarmup = resolve;
    });
    state.onStrokeWarmup = () => {
      enteredStrokeWarmup();
      return new Promise<void>((resolve) => {
        releaseWarmup = resolve;
      });
    };

    try {
      const preparePromise = graphics.prepare();
      await strokeWarmupEntered;

      // Dispose concurrently while strokeFieldCamera has strokeWarmupTarget bound and warmup is in-flight.
      graphics.dispose();
      releaseWarmup();

      await expect(preparePromise).rejects.toMatchObject({ name: "AbortError" });

      // All temporary warmup textures, render targets, and meshes allocated during prepare() must be destroyed.
      const warmupTextures = state.createdTextures.slice(texturesBeforePrepare);
      const warmupTargets = state.createdTargets.slice(targetsBeforePrepare);
      const warmupMeshes = state.createdMeshes.slice(meshesBeforePrepare);
      expect(warmupTextures.length).toBeGreaterThanOrEqual(2);
      expect(warmupTargets.length).toBe(1);
      expect(warmupMeshes.length).toBeGreaterThanOrEqual(2);
      expect(warmupTextures.every((t) => t.destroyed)).toBe(true);
      expect(warmupTargets.every((t) => t.destroyed)).toBe(true);
      expect(warmupMeshes.every((m) => m.destroyed)).toBe(true);
    } finally {
      state.onStrokeWarmup = undefined;
    }
  });

  it("allocates zero legacy toolbar/palette/badge meshes and plays shutter audio via Engine AudioSource", async () => {
    state.createdTextures.length = 0;
    state.createdTargets.length = 0;
    state.createdMeshes.length = 0;
    state.createdAudioSources.length = 0;
    state.audioResumeCalls = 0;
    state.throwOnRenderTarget = false;

    const loadedAudioRequests: Array<{ url: string; type: string }> = [];
    const fakeClip = { name: "shutter-clip" };
    const decode = Promise.withResolvers<typeof fakeClip>();
    const mainScene = new (Scene as any)({}, "main");
    const engine: any = {
      canvas: { width: 800, height: 600 },
      sceneManager: {
        addScene() {},
        removeScene() {}
      },
      resourceManager: {
        load: vi.fn(async (req: { url: string; type: string }) => {
          loadedAudioRequests.push(req);
          return decode.promise;
        })
      }
    };
    const worldCamera: any = {
      scene: mainScene,
      cullingMask: -1,
      priority: 0,
      destroyed: false
    };
    const canvas: any = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    };

    const graphics = new PhotoGraphics(engine, canvas, worldCamera, () => {});
    // Only the editing backdrop cuboid mesh should exist — no hidden toolbar, 48-swatch palette, or badge meshes.
    expect(state.createdMeshes).toHaveLength(1);
    expect(state.createdMeshes[0]!.name).toBe("cuboid");
    expect(state.createdAudioSources).toHaveLength(1);
    const audioSource = state.createdAudioSources[0]!;
    expect(audioSource.playOnEnabled).toBe(false);
    expect(audioSource.loop).toBe(false);
    expect(audioSource.spatial).toBe(false);
    expect(audioSource.volume).toBeGreaterThan(0);

    // Cold click before prepare() captures the gesture via AudioManager.resume() and plays once the WAV AudioClip loads.
    graphics.playShutter();
    expect(state.audioResumeCalls).toBe(1);
    await graphics.prepare();
    expect(audioSource.clip).toBeNull();
    expect(audioSource.playCalls).toEqual([]);
    decode.resolve(fakeClip);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadedAudioRequests).toHaveLength(1);
    expect(loadedAudioRequests[0]!.type).toBe("Audio");
    expect(loadedAudioRequests[0]!.url.startsWith("data:audio/wav;base64,")).toBe(true);
    // Decode base64 header to assert valid RIFF/WAVE header.
    const wavHeader = atob(loadedAudioRequests[0]!.url.slice("data:audio/wav;base64,".length)).slice(0, 12);
    expect(wavHeader.slice(0, 4)).toBe("RIFF");
    expect(wavHeader.slice(8, 12)).toBe("WAVE");
    expect(audioSource.clip).toBe(fakeClip);
    expect(audioSource.stopCalls).toBe(1);
    expect(audioSource.playCalls).toEqual([0]);

    // Warm click plays synchronously without reloading the AudioClip or calling AudioManager.resume() manually.
    graphics.playShutter();
    expect(loadedAudioRequests).toHaveLength(1);
    expect(audioSource.stopCalls).toBe(2);
    expect(audioSource.playCalls).toEqual([0, 0]);

    // Dispose stops and detaches the clip cleanly; subsequent playShutter() is a no-op.
    graphics.dispose();
    expect(audioSource.destroyed).toBe(true);
    expect(audioSource.clip).toBeNull();
    graphics.playShutter();
    expect(audioSource.playCalls).toEqual([0, 0]);
  });

  it("recovers cleanly without TDZ error or poisoned loading cache when resourceManager.load throws synchronously or rejects asynchronously", async () => {
    state.createdAudioSources.length = 0;
    state.audioResumeCalls = 0;
    state.throwOnRenderTarget = false;

    const fakeClip = { name: "recovered-shutter-clip" };
    let mode: "sync-throw" | "async-reject" | "resolve" = "sync-throw";
    const load = vi.fn(() => {
      if (mode === "sync-throw") {
        throw "loader not found: Audio";
      }
      if (mode === "async-reject") {
        return Promise.reject(new Error("decode failed"));
      }
      return Promise.resolve(fakeClip);
    });
    const mainScene = new (Scene as any)({}, "main");
    const engine: any = {
      canvas: { width: 800, height: 600 },
      sceneManager: { addScene() {}, removeScene() {} },
      resourceManager: { load }
    };
    const worldCamera: any = { scene: mainScene, cullingMask: -1, priority: 0, destroyed: false };
    const canvas: any = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };

    const graphics = new PhotoGraphics(engine, canvas, worldCamera, () => {});
    const audioSource = state.createdAudioSources[0]!;

    // 1. Synchronous throw during prepare() must NOT reject prepare() or poison shutterClipLoading.
    await expect(graphics.prepare()).resolves.toBeUndefined();
    expect(load).toHaveBeenCalledTimes(1);
    expect(audioSource.clip).toBeNull();
    expect((graphics as any).shutterClipLoading).toBeUndefined();

    // 2. Subsequent async rejection on playShutter() must clear shutterClipLoading cleanly without playing.
    mode = "async-reject";
    graphics.playShutter();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(2);
    expect(audioSource.clip).toBeNull();
    expect(audioSource.playCalls).toEqual([]);
    expect((graphics as any).shutterClipLoading).toBeUndefined();

    // 3. Recovery once Audio loader/decode succeeds must attach clip, clear in-flight pointer, and play cleanly.
    mode = "resolve";
    graphics.playShutter();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).toHaveBeenCalledTimes(3);
    expect(audioSource.clip).toBe(fakeClip);
    expect(audioSource.playCalls).toEqual([0]);
    expect((graphics as any).shutterClipLoading).toBeUndefined();

    graphics.dispose();
  });
});

describe("Shared Voice Orb HUD layout & overlap prevention", () => {
  it("keeps the centered wide-layout chat bar separated from the 1.72x expanded Voice Orb", () => {
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
      [1920, 1080]
    ] as const) {
      const m = resolveSeedWorldVoiceOrbLayout(width, height);
      expect(m.useWideLayout).toBe(true);
      const panelWidthUnits = Math.max(
        SEED_WORLD_VOICE_ORB_LAYOUT.panelMinWidth,
        Math.min(560, m.availableCenteredWidthUnits)
      );
      const panelRightEdgeFromRightUnits = (m.referenceWidth - panelWidthUnits) * 0.5;
      const expandedOrbLeftFromRightUnits = m.orbRightUnits + m.orbSizeUnits + m.orbExpandHalfUnits;
      expect(panelRightEdgeFromRightUnits - expandedOrbLeftFromRightUnits).toBeGreaterThanOrEqual(
        SEED_WORLD_VOICE_ORB_LAYOUT.reservedRightGap
      );
    }
  });

  it("switches to narrow layout below the threshold and keeps the lifted transcript strictly above the 1.72x expanded orb", () => {
    for (const [width, height] of [
      [411, 801],
      [390, 844],
      [820, 720]
    ] as const) {
      const m = resolveSeedWorldVoiceOrbLayout(width, height);
      expect(m.useWideLayout).toBe(false);
      const panelBottomAtPressUnits =
        m.orbBottomUnits +
        m.orbSizeUnits +
        SEED_WORLD_VOICE_ORB_LAYOUT.narrowPanelGap +
        m.orbExpandHalfUnits +
        SEED_WORLD_VOICE_ORB_LAYOUT.narrowPanelLiftPadding;
      const expandedOrbTopUnits = m.orbBottomUnits + m.orbSizeUnits + m.orbExpandHalfUnits;
      expect(panelBottomAtPressUnits - expandedOrbTopUnits).toBeGreaterThanOrEqual(
        SEED_WORLD_VOICE_ORB_LAYOUT.narrowPanelGap + SEED_WORLD_VOICE_ORB_LAYOUT.narrowPanelLiftPadding
      );
    }
  });

  it("keeps photoDetailLayout clear of the Voice Orb in both landscape and portrait viewports", () => {
    const landscape = photoDetailLayout(1280, 800);
    const landscapeOrb = resolveSeedWorldVoiceOrbLayout(1280, 800);
    expect(landscape.photo.x + landscape.photo.width).toBeLessThan(landscapeOrb.orbLeftPx);

    const portrait = photoDetailLayout(411, 801);
    const portraitOrb = resolveSeedWorldVoiceOrbLayout(411, 801);
    expect(portrait.photo.y + portrait.photo.height).toBeLessThan(portraitOrb.orbTopPx);
  });
});
