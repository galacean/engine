import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  createdTextures: [] as Array<{ width: number; height: number; isGCIgnored: boolean; destroyed: boolean }>,
  createdTargets: [] as Array<{ width: number; height: number; destroyed: boolean }>,
  throwOnRenderTarget: false
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
  class Matrix {}
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
    setPositions() {}
    setUVs() {}
    setColors() {}
    setIndices() {}
    addSubMesh() {}
    uploadData() {}
    destroy() {}
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
    entity: any;
    constructor(entity: any) {
      this.entity = entity;
    }
    setMaterial() {}
  }
  class EntityStub {
    layer = 0;
    isActive = true;
    children: EntityStub[] = [];
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
      return new Ctor(this);
    }
    getComponentsIncludeChildren() {
      return [];
    }
    destroy() {}
  }
  return {
    BackgroundMode: { SolidColor: 0 },
    BaseMaterial: Material,
    Camera: class {},
    CameraClearFlags: { Depth: 2, Color: 1 },
    Color,
    Entity: EntityStub,
    Font: { createFromOS: () => ({}) },
    Layer: { Layer25: 1 << 25 },
    Material,
    Matrix,
    MeshRenderer,
    ModelMesh,
    PrimitiveMesh: {},
    RenderFace: { Double: 2 },
    RenderTarget,
    Scene: class {},
    Script: class {},
    Shader: { find: () => ({}), create: () => ({}) },
    TextRenderer: class {},
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

vi.mock("@galacean/engine-modify/rendering/LiquidGlassPostProcessPass", () => ({
  SeedWorldLiquidGlassUiMaterial: class {}
}));
vi.mock("@galacean/engine-modify/geometry/destroyOwnedMesh", () => ({
  destroyOwnedMesh(mesh?: { destroy?: () => void }) {
    mesh?.destroy?.();
  }
}));
vi.mock("../src/world/SeedWorldPhotoWarmup", () => ({
  warmupPhotoPresentation: vi.fn(async () => {})
}));
vi.mock("../src/world/SeedWorldShaderWarmup", () => ({
  warmupSeedWorldRendererVariants: vi.fn(async () => {})
}));

import { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { Entity, Texture2D } from "@galacean/engine";
import { PhotoSurface } from "../src/world/SeedWorldPhotoGraphics";
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

describe("PhotoSurface stroke mask budget & failure cleanup", () => {
  it("reserves display budget when lazily allocating strokeMaskTarget and releases it on dispose", () => {
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
    expect(budget.stats.display).toBe(0);

    surface.paint([{ points: [{ x: 10, y: 10 }, { x: 120, y: 90 }], width: 6, color: "#ff453a" }]);
    const expectedBytes = 768 * 480 * 4;
    expect(budget.stats.display).toBe(expectedBytes);
    expect(graphics.renderStrokeField).toHaveBeenCalledTimes(1);

    // Subsequent paints reuse the allocated RenderTarget without double-charging budget.
    surface.paint([{ points: [{ x: 20, y: 20 }, { x: 160, y: 140 }], width: 6, color: "#ff453a" }]);
    expect(budget.stats.display).toBe(expectedBytes);

    surface.dispose();
    expect(budget.stats.display).toBe(0);
    expect(budget.stats.total).toBe(0);
  });

  it("destroys the newly created isGCIgnored Texture2D and releases budget if RenderTarget construction throws", () => {
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
