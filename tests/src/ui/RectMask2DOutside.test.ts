import {
  Camera,
  DepthTextureMode,
  Logger,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  Shader,
  ShaderMacro,
  UnlitMaterial,
  Entity,
  Script,
  Sprite,
  SpriteMaskInteraction,
  SpriteMask,
  SpriteMaskLayer,
  SpriteRenderer,
  Texture2D,
  RenderTarget,
  Layer,
  TextureFormat
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { UIHitResult } from "../../../packages/ui/src/input/UIHitResult";
import { WebXRSession } from "../../../packages/xr-webxr/src/WebXRSession";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import {
  CanvasRenderMode,
  Image,
  Mask,
  RectMask2D,
  RectMaskMode,
  Text,
  UICanvas,
  UITransform
} from "@galacean/engine-ui";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, describe, expect, it, vi } from "vitest";

class ClickCounter extends Script {
  count = 0;
  override onPointerClick(): void {
    this.count++;
  }
}

interface Fixture {
  engine: WebGLEngine;
  canvas: HTMLCanvasElement;
  ui: Entity;
  sprite: Sprite;
  pointerId: number;
}

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures) {
    f.engine.destroy();
    f.canvas.remove();
  }
  fixtures.length = 0;
});

const inside = RectMaskMode.Inside;
const outside = RectMaskMode.Outside;

describe("RectMask2D Outside", () => {
  for (const canvasMode of [
    CanvasRenderMode.ScreenSpaceOverlay,
    CanvasRenderMode.ScreenSpaceCamera,
    CanvasRenderMode.WorldSpace
  ]) {
    for (const [outerMode, innerMode] of [
      [inside, inside],
      [inside, outside],
      [outside, inside],
      [outside, outside]
    ]) {
      it(`intersects modes ${outerMode}/${innerMode} in canvas mode ${canvasMode}`, async () => {
        const f = await createFixture(canvasMode);
        // Outer covers x=16..80; inner covers x=48..112.
        const outer = addRect(f.ui, outerMode, 64, -16);
        const inner = addRect(outer.entity, innerMode, 64, 32);
        const image = addImage(f, inner.entity, -16);
        for (const x of [8, 32, 64, 96, 120]) {
          const inOuter = x >= 16 && x <= 80;
          const inInner = x >= 48 && x <= 112;
          expectVisible(
            f,
            image,
            x,
            64,
            (outerMode === inside ? inOuter : !inOuter) && (innerMode === inside ? inInner : !inInner)
          );
        }
      });
    }
  }

  it("supports multiple holes", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay);
    const outer = addRect(f.ui, inside, 112);
    const left = addRect(outer.entity, outside, 20, -30);
    const right = addRect(left.entity, outside, 20, 60);
    const image = addImage(f, right.entity, -30);
    expectVisible(f, image, 34, 64, false);
    expectVisible(f, image, 94, 64, false);
    expectVisible(f, image, 64, 64, true);
    expectVisible(f, image, 4, 64, false);
  });

  it("excludes the union of overlapping and disjoint Outside ancestors", async () => {
    const f = await createFixture();
    const a = addRect(f.ui, outside, 40, -20);
    const b = addRect(a.entity, outside, 40, 30);
    const c = addRect(b.entity, outside, 10, 40);
    const image = addImage(f, c.entity, -50);
    for (const x of [32, 60, 80, 114]) expectVisible(f, image, x, 64, false);
    expectVisible(f, image, 100, 64, true);
    expectVisible(f, image, 10, 64, true);
    // Equal holes do not cancel one another.
    b.entity.transform.setPosition(0, 0, 0);
    c.enabled = false;
    image.entity.transform.setPosition(20, 0, 0);
    expectVisible(f, image, 44, 64, false);
    expectVisible(f, image, 94, 64, true);
  });

  it("does not batch different holes or leak nested holes into siblings", async () => {
    const f = await createFixture();
    const outer = addRect(f.ui, inside, 120);
    const left = addRect(outer.entity, outside, 20, -30);
    const a = addImage(f, left.entity);
    (a.entity.transform as UITransform).size.set(50, 80);
    const right = addRect(outer.entity, outside, 20, 30);
    const b = addImage(f, right.entity);
    (b.entity.transform as UITransform).size.set(50, 80);
    expectVisible(f, a, 34, 64, false);
    expectVisible(f, b, 94, 64, false);
    expectVisible(f, a, 16, 64, true);
    expectVisible(f, b, 112, 64, true);
    a.enabled = b.enabled = false;
    const sibling = addImage(f, outer.entity);
    expectVisible(f, sibling, 34, 64, true);
    expectVisible(f, sibling, 94, 64, true);
    expectVisible(f, sibling, 2, 64, false);
  });

  it("updates modes, transforms, ancestry and enabled state without stale clipping", async () => {
    const f = await createFixture();
    const mask = addRect(f.ui, inside, 40);
    const image = addImage(f, mask.entity);
    expectVisible(f, image, 64, 64, true);
    mask.mode = outside;
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 24, 64, true);
    mask.entity.transform.setPosition(40, 0, 0);
    image.entity.transform.setPosition(-40, 0, 0);
    expectVisible(f, image, 64, 64, true);
    expectVisible(f, image, 104, 64, false);
    mask.enabled = false;
    expectVisible(f, image, 104, 64, true);
    mask.enabled = true;
    expectVisible(f, image, 104, 64, false);
    image.entity.parent = f.ui;
    image.entity.transform.setPosition(0, 0, 0);
    expectVisible(f, image, 104, 64, true);
    image.entity.parent = mask.entity;
    image.entity.transform.setPosition(-40, 0, 0);
    expectVisible(f, image, 104, 64, false);
    mask.destroy();
    expectVisible(f, image, 104, 64, true);
  });

  it("treats an empty Outside rectangle as excluding nothing", async () => {
    const f = await createFixture();
    const mask = addRect(f.ui, outside, 0);
    const image = addImage(f, mask.entity);
    expectVisible(f, image, 64, 64, true);
    mask.mode = inside;
    expectVisible(f, image, 64, 64, false);
    mask.mode = outside;
    (mask.entity.transform as UITransform).size.set(40, 80);
    expectVisible(f, image, 64, 64, false);
    (mask.entity.transform as UITransform).size.y = 0;
    expectVisible(f, image, 64, 64, true);
  });

  it("composes with sprite-shaped UI Mask and leaves the mask's own graphic unaffected", async () => {
    const f = await createFixture();
    const spriteMask = f.ui.createChild("spriteMask").addComponent(Mask);
    spriteMask.sprite = f.sprite;
    (spriteMask.entity.transform as UITransform).size.set(100, 100);
    const rect = addRect(spriteMask.entity, outside, 40);
    const image = addImage(f, rect.entity);
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 24, 64, true);
    expectVisible(f, image, 4, 64, false);
    image.enabled = false;
    const own = rect.entity.addComponent(Image);
    own.sprite = f.sprite;
    own.color.set(1, 0, 0, 1);
    expectVisible(f, own, 64, 64, true);
  });

  for (const interaction of [
    SpriteMaskInteraction.VisibleInsideMask,
    SpriteMaskInteraction.VisibleOutsideMask,
    SpriteMaskInteraction.None
  ]) {
    it(`intersects holes with sprite Mask interaction ${interaction}`, async () => {
      const f = await createFixture();
      const a = f.ui.createChild("maskA").addComponent(Mask);
      a.sprite = f.sprite;
      (a.entity.transform as UITransform).size.set(64, 120);
      a.entity.transform.setPosition(-16, 0, 0);
      const b = a.entity.createChild("maskB").addComponent(Mask);
      b.sprite = f.sprite;
      (b.entity.transform as UITransform).size.set(64, 120);
      b.entity.transform.setPosition(32, 0, 0);
      const hole = addRect(b.entity, outside, 12, -16);
      const image = addImage(f, hole.entity);
      image.maskInteraction = interaction;
      // Sprite intersection is x=48..80, rect hole is x=58..70.
      for (const x of [8, 32, 52, 64, 76, 96, 120]) {
        const inSprites = x >= 48 && x <= 80;
        const spriteVisible =
          interaction === SpriteMaskInteraction.None ||
          (interaction === SpriteMaskInteraction.VisibleInsideMask ? inSprites : !inSprites);
        expectVisible(f, image, x, 64, spriteVisible && (x < 58 || x > 70));
      }
      // Move the hole into the complement. It must still exclude clicks and pixels there.
      hole.entity.transform.setPosition(-48, 0, 0);
      image.entity.transform.setPosition(32, 0, 0);
      expectVisible(f, image, 32, 64, false);
    });
  }

  it("supports eight nonempty Outside ancestors", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay);
    let parent = f.ui;
    for (let i = 0; i < 8; i++) parent = addRect(parent, outside, 40).entity;
    const image = addImage(f, parent);
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 24, 64, true);
  });

  it("shares all eight bits between image masks and Outside rectangles", async () => {
    const f = await createFixture();
    let parent = f.ui;
    for (let i = 0; i < 4; i++) {
      const shape = parent.createChild("shape").addComponent(Mask);
      shape.sprite = f.sprite;
      (shape.entity.transform as UITransform).size.set(100, 100);
      parent = addRect(shape.entity, outside, i === 3 ? 80 : 40).entity;
    }
    const image = addImage(f, parent);
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 32, 64, false);
    expectVisible(f, image, 20, 64, true);
    expectVisible(f, image, 4, 64, false);
  });

  it("reassigns rectangle bits when sibling branches have different image-mask depths", async () => {
    const f = await createFixture();
    const outer = f.ui.createChild("outer").addComponent(Mask);
    outer.sprite = f.sprite;
    (outer.entity.transform as UITransform).size.set(100, 100);
    const left = addRect(outer.entity, outside, 10, -30);
    const a = addImage(f, left.entity);
    (a.entity.transform as UITransform).size.set(40, 80);
    const inner = outer.entity.createChild("inner").addComponent(Mask);
    inner.sprite = f.sprite;
    (inner.entity.transform as UITransform).size.set(40, 100);
    inner.entity.transform.setPosition(30, 0, 0);
    const right = addRect(inner.entity, outside, 10);
    const b = addImage(f, right.entity);
    (b.entity.transform as UITransform).size.set(40, 80);
    expectVisible(f, a, 34, 64, false);
    expectVisible(f, a, 20, 64, true);
    expectVisible(f, b, 94, 64, false);
    expectVisible(f, b, 108, 64, true);
  });

  it("warns and skips the ninth stencil ancestor without corrupting overlay state, then recovers when disabled", async () => {
    const f = await createFixture();
    const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
    try {
      let parent = f.ui;
      for (let i = 0; i < 8; i++) parent = addRect(parent, outside, 40).entity;
      const ninth = parent.createChild("ninth").addComponent(Mask);
      ninth.sprite = f.sprite;
      (ninth.entity.transform as UITransform).size.set(100, 100);
      const image = addImage(f, ninth.entity);

      expect(() => render(f)).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("at most 8 stencil ancestors"));
      expectVisible(f, image, 32, 64, false);
      expectVisible(f, image, 64, 64, false);
      // Overlay pass must finish cleanly without leaking macro or camera state.
      expect(f.engine._macroCollection.isEnable(ShaderMacro.getByName("ENGINE_SHOULD_SRGB_CORRECT"))).toBe(false);
      // @ts-ignore
      expect(f.engine._renderContext.camera).toBeNull();

      ninth.enabled = false;
      expectVisible(f, image, 32, 64, true);
      expectVisible(f, image, 64, 64, false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not enforce receiver stencil limits on Mask writers when descendants ignore image masks", async () => {
    const f = await createFixture();
    let parent = f.ui;
    for (let i = 0; i < 8; i++) parent = addRect(parent, outside, 20).entity;
    const maskA = parent.createChild("maskA").addComponent(Mask);
    maskA.sprite = f.sprite;
    (maskA.entity.transform as UITransform).size.set(100, 100);
    const maskB = maskA.entity.createChild("maskB").addComponent(Mask);
    maskB.sprite = f.sprite;
    (maskB.entity.transform as UITransform).size.set(100, 100);
    const image = addImage(f, maskB.entity);
    image.maskInteraction = SpriteMaskInteraction.None;
    expectVisible(f, image, 20, 64, true);
    expectVisible(f, image, 64, 64, false);
  });

  it("does not consume stencil for hundreds of Inside rectangles", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera, false);
    let parent = f.ui;
    for (let i = 0; i < 513; i++) parent = addRect(parent, inside, 40).entity;
    const image = addImage(f, parent);
    expectVisible(f, image, 64, 64, true);
    expectVisible(f, image, 24, 64, false);
  });

  for (const spriteShape of [false, true]) {
    it(`warns and skips when camera target lacks stencil, then recovers (sprite=${spriteShape})`, async () => {
      const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera);
      const warnSpy = vi.spyOn(Logger, "warn").mockImplementation(() => {});
      try {
        const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
        const color = new Texture2D(f.engine, 128, 128, TextureFormat.R8G8B8A8_UNorm, false);
        camera.renderTarget = new RenderTarget(f.engine, 128, 128, color);
        let parent: Entity;
        if (spriteShape) {
          const mask = f.ui.createChild("shape").addComponent(Mask);
          mask.sprite = f.sprite;
          (mask.entity.transform as UITransform).size.set(40, 100);
          parent = mask.entity;
        } else {
          parent = addRect(f.ui, outside, 40).entity;
        }
        addImage(f, parent);
        expect(() => render(f)).not.toThrow();
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("stencil attachment"));
        const center = new Uint8Array(4),
          exterior = new Uint8Array(4);
        color.getPixelBuffer(64, 64, 1, 1, 0, center);
        color.getPixelBuffer(24, 64, 1, 1, 0, exterior);
        expect(center[0]).toBe(0);
        expect(exterior[0]).toBe(0);

        camera.renderTarget = new RenderTarget(f.engine, 128, 128, color, TextureFormat.DepthStencil);
        render(f);
        color.getPixelBuffer(64, 64, 1, 1, 0, center);
        color.getPixelBuffer(24, 64, 1, 1, 0, exterior);
        expect(center[0] > 220).toBe(spriteShape);
        expect(exterior[0] > 220).toBe(!spriteShape);
      } finally {
        warnSpy.mockRestore();
      }
    });
  }

  it(`keeps Inside clipping on depth-only targets`, async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera);
    const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
    const color = new Texture2D(f.engine, 128, 128, TextureFormat.R8G8B8A8_UNorm, false);
    camera.renderTarget = new RenderTarget(f.engine, 128, 128, color);
    const mask = addRect(f.ui, inside, 40);
    addImage(f, mask.entity);
    render(f);
    const center = new Uint8Array(4),
      exterior = new Uint8Array(4);
    color.getPixelBuffer(64, 64, 1, 1, 0, center);
    color.getPixelBuffer(24, 64, 1, 1, 0, exterior);
    expect(center[0]).toBeGreaterThan(220);
    expect(exterior[0]).toBe(0);
  });

  for (const depth of [true, false]) {
    it(`requests screen stencil only while visible Forward draws need it (depth=${depth})`, async () => {
      const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera, false, undefined, depth);
      const mask = addRect(f.ui, inside, 40);
      const image = addImage(f, mask.entity);
      const allocate = vi.spyOn(f.engine._renderTargetPool, "allocateRenderTarget");
      function expectAttachment(format: TextureFormat | null): void {
        const colorTargets = allocate.mock.calls.filter(([, , color]) => color !== null);
        expect(colorTargets.map(([, , , attachment]) => attachment)).toEqual([format]);
        allocate.mockClear();
      }
      try {
        render(f);
        expectAttachment(depth ? TextureFormat.Depth24 : null);
        mask.mode = outside;
        render(f);
        expectAttachment(depth ? TextureFormat.Depth24Stencil8 : TextureFormat.Stencil);
        expectVisible(f, image, 24, 64, true);
        expectVisible(f, image, 64, 64, false);
        allocate.mockClear();
        image.enabled = false;
        render(f);
        expectAttachment(depth ? TextureFormat.Depth24 : null);
      } finally {
        allocate.mockRestore();
      }
    });
  }

  it("keeps a depth-only UI pass from requesting Forward stencil", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace, false, new ShaderCompiler());
    const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
    camera.depthTextureMode = DepthTextureMode.PrePass;
    const shader =
      Shader.find("Test/UIDepthOnly") ??
      Shader.create(`Shader "Test/UIDepthOnly" {
      SubShader "Default" { UsePass "Pipeline/DepthOnly/Default/DepthOnly" }
    }`)!;
    const mask = addRect(f.ui, outside, 20);
    addImage(f, mask.entity).setMaterial(new Material(f.engine, shader));
    const allocate = vi.spyOn(f.engine._renderTargetPool, "allocateRenderTarget");
    try {
      render(f);
      expect((camera.shaderData.getTexture("camera_DepthTexture") as Texture2D).format).toBe(
        TextureFormat.Depth24Stencil8
      );
      const colorTargets = allocate.mock.calls.filter(([, , color]) => color !== null);
      expect(colorTargets.map(([, , , attachment]) => attachment)).toEqual([TextureFormat.Depth24]);
    } finally {
      allocate.mockRestore();
    }
  });

  for (const alpha of [false, true]) {
    it(`preserves screen RGBA when switching to masked Overlay (alpha=${alpha})`, async () => {
      const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay, false, undefined, true, alpha);
      f.engine.sceneManager.activeScene.background.solidColor.set(0.2, 0.4, 0.6, 0.5);
      const hole = addRect(f.ui, outside, 20);
      const image = addImage(f, hole.entity);
      image.color.a = 0.5;
      hole.enabled = false;
      render(f);
      const background = pixel(f, 64, 2);
      const blended = pixel(f, 30, 64);
      expect(background[0]).toBeGreaterThan(0);
      expect(background[3]).toBe(alpha ? 128 : 255);
      hole.enabled = true;
      render(f);
      expect(getGL(f).getError()).toBe(getGL(f).NO_ERROR);
      expect(pixel(f, 64, 64)).toEqual(background);
      expect(pixel(f, 30, 64)).toEqual(blended);
    });
  }

  it.each([false, true])(
    "preserves Overlay order when a sibling starts using stencil (existing depth=%s)",
    async (existingDepth) => {
      const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay, true, undefined, true, true, existingDepth);
      expect(getGL(f).getContextAttributes()!.depth).toBe(existingDepth);
      const blue = new UnlitMaterial(f.engine);
      blue.isTransparent = true;
      blue.shaderData.setInt("depthWriteEnabled", 1);
      blue.baseColor.set(0, 0, 1, 1);
      addImage(f, f.ui).setMaterial(blue);
      const top = addImage(f, f.ui);
      const hole = addRect(f.ui, outside, 8, 50);
      const masked = addImage(f, hole.entity);
      (masked.entity.transform as UITransform).size.set(18, 18);
      for (const enabled of [false, true]) {
        hole.enabled = enabled;
        render(f);
        expect(Array.from(pixel(f, 64, 64))).toEqual([255, 0, 0, 255]);
        expectClick(f, top, 64, 64, true);
      }
    }
  );

  it.each([
    [256, true],
    [128, false]
  ] as const)("preserves redirected output width %i and alpha (context alpha=%s)", async (width, alpha) => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay, false, undefined, true, alpha);
    f.ui.parent!.findByName("camera")!.getComponent(Camera)!.enabled = false;
    const left = addImage(f, f.ui, -32);
    (left.entity.transform as UITransform).size.set(64, 128);
    const right = addImage(f, f.ui, 32);
    (right.entity.transform as UITransform).size.set(64, 128);
    right.color.set(0, 0, 1, 0.5);

    const holes = [1, 2].map((order) => {
      const canvas = f.ui.parent!.createChild("overlay").addComponent(UICanvas);
      canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
      canvas.referenceResolution.set(128, 128);
      canvas.sortOrder = order;
      const hole = addRect(canvas.entity, outside, 8);
      const image = addImage(f, hole.entity);
      (image.entity.transform as UITransform).size.set(16, 16);
      return hole;
    });

    const gl = getGL(f) as WebGL2RenderingContext;
    const color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, 128);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    const session = new WebXRSession(
      f.engine._hardwareRenderer,
      { requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} } as unknown as XRSession,
      { framebuffer, framebufferWidth: width, framebufferHeight: 128 } as XRWebGLLayer,
      {} as XRReferenceSpace
    );
    const copy = vi.spyOn(gl, "copyTexSubImage2D");
    try {
      session.onUpdate();
      for (const enabled of [false, true]) {
        for (const hole of holes) hole.enabled = enabled;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        copy.mockClear();
        render(f);
        expect(copy).toHaveBeenCalledTimes(enabled ? 1 : 0);
        expect(Array.from(pixel(f, width - 12, 72))).toEqual([0, 0, 127, 128]);
        expect(gl.getError()).toBe(gl.NO_ERROR);
      }
    } finally {
      copy.mockRestore();
      session.stop();
      gl.deleteFramebuffer(framebuffer);
      gl.deleteRenderbuffer(color);
    }
  });

  it("uses the surviving XY plane of a rotated canvas under a flattened parent", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const root = f.ui.parent!;
    const camera = root.findByName("camera")!.getComponent(Camera)!;
    camera.entity.transform.setPosition(64, 64, 85);
    camera.farClipPlane = 1000;
    const holder = root.createChild("flat parent");
    holder.transform.setPosition(64, 64, 0);
    holder.transform.setScale(1, 1, 0);
    holder.transform.setRotation(21, 27, 6);
    holder.addChild(f.ui);
    f.ui.transform.setPosition(0, 0, 0);
    f.ui.transform.setRotation(14, 32, 15);
    const mask = addRect(f.ui, inside, 24);
    const image = addImage(f, mask.entity);
    for (const mode of [inside, outside]) {
      mask.mode = mode;
      expectVisible(f, image, 64, 64, mode === inside);
      expectVisible(f, image, 92, 64, mode === outside);
    }
  });

  it("resolves sibling clipping once per traversal and refreshes it for same-frame input", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const mask = addRect(f.ui, inside, 40);
    const first = addImage(f, mask.entity);
    const top = addImage(f, mask.entity);
    const canvas = f.ui.getComponent(UICanvas)!;
    const ray = new Ray(new Vector3(64, 64, 10), new Vector3(0, 0, -1));
    const hit = new UIHitResult();
    const geometry = vi.spyOn(mask, "_getCanvasRect");
    render(f);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(canvas._raycast(ray, hit, 100, Layer.Everything)).toBe(true);
    expect(hit.entity).toBe(top.entity);
    mask.mode = outside;
    geometry.mockClear();
    expect(canvas._raycast(ray, hit, 100, Layer.Everything)).toBe(false);
    expect(geometry).toHaveBeenCalledTimes(1);
    mask.entity.transform.setPosition(32, 0, 0);
    expect(canvas._raycast(ray, hit, 100, Layer.Everything)).toBe(true);
    expect(hit.entity).toBe(top.entity);
    f.ui.addChild(first.entity);
    mask.entity.transform.setPosition(0, 0, 0);
    expect(canvas._raycast(ray, hit, 100, Layer.Everything)).toBe(true);
    expect(hit.entity).toBe(first.entity);
  });

  it("copies the Overlay background only for a masked Transparent Forward pass", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay, false, new ShaderCompiler());
    const image = addImage(f, addRect(f.ui, outside, 20).entity);
    const uiMaterial = image.getMaterial()!;
    const depthShader =
      Shader.find("Test/UIDepthOnly") ??
      Shader.create(`Shader "Test/UIDepthOnly" {
        SubShader "Default" { UsePass "Pipeline/DepthOnly/Default/DepthOnly" }
      }`)!;
    const opaque = new UnlitMaterial(f.engine);
    const copy = vi.spyOn(getGL(f), "copyTexSubImage2D");
    try {
      for (const material of [new Material(f.engine, depthShader), opaque, uiMaterial]) {
        image.setMaterial(material);
        copy.mockClear();
        render(f);
        const draws = material === uiMaterial;
        expect(copy).toHaveBeenCalledTimes(draws ? 1 : 0);
        expect(pixel(f, 30, 64)[0]).toBe(draws ? 255 : 0);
        expect(pixel(f, 64, 64)[0]).toBe(0);
      }
    } finally {
      copy.mockRestore();
    }
  });

  for (const mode of [inside, outside]) {
    it(`clips in sheared canvas local XY when the receiver moves in Z (mode=${mode})`, async () => {
      const f = await createFixture(CanvasRenderMode.WorldSpace);
      const root = f.ui.parent!;
      const camera = root.findByName("camera")!.getComponent(Camera)!;
      camera.entity.transform.setPosition(64, 64, 128);
      camera.farClipPlane = 512;
      const holder = root.createChild("scaled holder");
      holder.transform.setPosition(64, 64, 0);
      holder.transform.setScale(2, 1, 1);
      holder.addChild(f.ui);
      f.ui.transform.setPosition(0, 0, 0);
      f.ui.transform.setRotation(0, 45, 0);
      const image = addImage(f, addRect(f.ui, mode, 10).entity);
      image.entity.transform.setPosition(0, 0, 20);
      // Local (0, 0, 20) projects to x=92.3, within the mask's local x range [-5, 5].
      expectVisible(f, image, 92, 64, mode === inside);
      expectVisible(f, image, 104, 64, mode === outside);
      // Flattening Z moves the image center back to x=64 and leaves its XY plane valid.
      f.ui.transform.setScale(1, 1, 0);
      expectVisible(f, image, 64, 64, mode === inside);
      expectVisible(f, image, 76, 64, mode === outside);
    });
  }

  it("draws the complement of image-mask intersections only once per pixel", async () => {
    const f = await createFixture();
    const a = f.ui.createChild("a").addComponent(Mask);
    a.sprite = f.sprite;
    (a.entity.transform as UITransform).size.set(64, 100);
    a.entity.transform.setPosition(-16, 0, 0);
    const b = a.entity.createChild("b").addComponent(Mask);
    b.sprite = f.sprite;
    (b.entity.transform as UITransform).size.set(64, 100);
    b.entity.transform.setPosition(32, 0, 0);
    const hole = addRect(b.entity, outside, 8, 16);
    const image = addImage(f, hole.entity, -32);
    image.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    image.color.a = 0.5;
    render(f);
    const alphaBlendedRed = pixel(f, 8, 64)[0];
    expect(alphaBlendedRed).toBeGreaterThan(0);
    expect(alphaBlendedRed).toBeLessThan(220);
    for (const x of [8, 32, 112]) {
      expect(pixel(f, x, 64)[0]).toBe(alphaBlendedRed);
      expectClick(f, image, x + 0.5, 64.5, true);
    }
    expectVisible(f, image, 64, 64, false, false);
    expectVisible(f, image, 96, 64, false, false);
  });

  it("skips empty Outside ancestors", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay);
    let parent = f.ui;
    for (let i = 0; i < 513; i++) parent = addRect(parent, outside, 0).entity;
    const image = addImage(f, parent);
    expectVisible(f, image, 64, 64, true);
    // No active stencil rectangles are derived from empty constraints.
    expect(image._clipScope.outsideRects.length).toBe(0);
  });

  it("clips world XY on the receiver plane under perspective projection", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
    camera.isOrthographic = false;
    camera.fieldOfView = 90;
    camera.farClipPlane = 512;
    camera.entity.transform.setPosition(64, 64, 128);
    const outer = addRect(f.ui, inside, 100);
    const hole = addRect(outer.entity, outside, 40);
    const image = addImage(f, hole.entity);
    image.entity.transform.setPosition(0, 0, 64);
    // At this receiver depth, one world unit spans one pixel. Projecting the mask's
    // own z=0 plane instead would incorrectly retain x=48 and clip x=20.
    expectVisible(f, image, 48, 64, false);
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 20, 64, true);
    expectVisible(f, image, 108, 64, true);
    expectVisible(f, image, 4, 64, false);
  });

  for (const [label, rx, ry, rz] of [
    ["yaw=-90", 0, -90, 0],
    ["pitch=-30,yaw=-90", -30, -90, 0],
    ["roll=45", 0, 0, 45]
  ] as const) {
    it(`clips Inside and Outside in root canvas local XY for rotated ScreenSpaceCamera (${label})`, async () => {
      const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera);
      const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
      camera.entity.transform.setPosition(12, -8, 25);
      camera.entity.transform.setRotation(rx, ry, rz);

      // Outer Inside covers canvas local x=-50..50 (screen x=14..114);
      // Inner Outside covers canvas local x=-20..20 (screen x=44..84).
      const outer = addRect(f.ui, inside, 100);
      const hole = addRect(outer.entity, outside, 40);
      const image = addImage(f, hole.entity);

      expectVisible(f, image, 64, 64, false);
      expectVisible(f, image, 28, 64, true);
      expectVisible(f, image, 100, 64, true);
      expectVisible(f, image, 6, 64, false);
      expectVisible(f, image, 122, 64, false);
    });
  }

  it("clips Inside and Outside in root canvas local XY for 3D-rotated WorldSpace canvas", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
    camera.entity.transform.setPosition(10, 5, -3);
    camera.entity.transform.setRotation(0, -90, 0);
    f.ui.transform.setPosition(20, 5, -3);
    f.ui.transform.setRotation(0, -90, 0);

    const outer = addRect(f.ui, inside, 100);
    const hole = addRect(outer.entity, outside, 40);
    const image = addImage(f, hole.entity);

    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 28, 64, true);
    expectVisible(f, image, 100, 64, true);
    expectVisible(f, image, 6, 64, false);
    expectVisible(f, image, 122, 64, false);
  });

  it("clips UI Text with RectMask2D Inside under rotated ScreenSpaceCamera", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera);
    f.ui.getComponent(UICanvas)!.referenceResolutionPerUnit = 100;
    const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
    camera.entity.transform.setRotation(0, -90, 0);

    // Mask covers the right half (canvas local x=0..64, screen x=64..128).
    const mask = addRect(f.ui, inside, 64, 32);
    const textEntity = mask.entity.createChild("text");
    (textEntity.transform as UITransform).size.set(120, 100);
    textEntity.transform.setPosition(-32, 0, 0);
    const text = textEntity.addComponent(Text);
    text.text = "MMMM";
    text.fontSize = 40;
    text.color.set(1, 0, 0, 1);

    render(f);
    const pixels = new Uint8Array(128 * 128 * 4);
    const gl = getGL(f);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let leftLit = 0;
    let rightLit = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 62; x++) {
        if (pixels[(y * 128 + x) * 4] > 0) leftLit++;
      }
      for (let x = 66; x < 128; x++) {
        if (pixels[(y * 128 + x) * 4] > 100) rightLit++;
      }
    }
    expect(leftLit).toBe(0);
    expect(rightLit).toBeGreaterThan(10);
  });

  it("keeps coplanar graphics with the same holes batchable", async () => {
    const f = await createFixture();
    const hole = addRect(f.ui, outside, 40);
    const left = addImage(f, hole.entity, -32);
    const right = addImage(f, hole.entity, 32);
    (left.entity.transform as UITransform).size.set(64, 100);
    (right.entity.transform as UITransform).size.set(64, 100);
    expectVisible(f, left, 24, 64, true);
    expectVisible(f, right, 104, 64, true);
    expectVisible(f, right, 64, 64, false);
    expect(f.ui.getComponent(UICanvas)!._batchedRenderElements).toHaveLength(1);
  });

  it("does not combine stencil coverage from overlapping graphics on different planes", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.ui.parent!.findByName("camera")!.getComponent(Camera)!;
    camera.isOrthographic = false;
    camera.fieldOfView = 90;
    camera.farClipPlane = 512;
    camera.entity.transform.setPosition(64, 64, 128);
    const hole = addRect(f.ui, outside, 40);
    const background = addImage(f, hole.entity);
    const foreground = addImage(f, hole.entity);
    foreground.entity.transform.setPosition(0, 0, 64);
    // The foreground is clipped here, but the same ray hits the background outside
    // the hole. Its visible pixel and click must survive the foreground's stencil write.
    expectVisible(f, background, 48, 64, true);
    expectVisible(f, foreground, 24, 64, true);
    expectVisible(f, foreground, 64, 64, false);
  });

  it("renders Outside on Overlay without a scene camera and clears it between canvases", async () => {
    const f = await createFixture();
    f.ui.parent!.findByName("camera")!.destroy();
    const hole = addRect(f.ui, outside, 40);
    const image = addImage(f, hole.entity);
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 24, 64, true);
    const second = f.ui.parent!.createChild("secondCanvas");
    const canvas = second.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    canvas.referenceResolution.set(128, 128);
    canvas.referenceResolutionPerUnit = 1;
    canvas.sortOrder = 1;
    const other = addImage(f, second);
    (other.entity.transform as UITransform).size.set(20, 20);
    expectVisible(f, other, 64, 64, true);
    expectVisible(f, image, 24, 64, true);
  });

  it("preserves SpriteMask layer selection before and after Outside UI draws", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera);
    const root = f.ui.parent!;
    const spriteMask = root.createChild("spriteMask").addComponent(SpriteMask);
    spriteMask.entity.transform.setPosition(64, 64, 0);
    spriteMask.sprite = f.sprite;
    spriteMask.width = spriteMask.height = 128;
    spriteMask.influenceLayers = SpriteMaskLayer.Layer1;
    const sprites = [16, 112].map((x, i) => {
      const sprite = root.createChild("sprite").addComponent(SpriteRenderer);
      sprite.entity.transform.setPosition(x, 64, 0);
      sprite.sprite = f.sprite;
      sprite.width = sprite.height = 16;
      sprite.color.set(0, 0, 1, 1);
      sprite.priority = i ? 1 : -1;
      sprite.maskLayer = SpriteMaskLayer.Layer1;
      sprite.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
      return sprite;
    });
    const hole = addRect(f.ui, outside, 20);
    const image = addImage(f, hole.entity);
    (image.entity.transform as UITransform).size.set(60, 80);
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 44, 64, true);
    for (const x of [16, 112]) expect(pixel(f, x, 64)[2]).toBeGreaterThan(220);
    for (const sprite of sprites) sprite.maskLayer = SpriteMaskLayer.Layer0;
    render(f);
    for (const x of [16, 112]) expect(pixel(f, x, 64)[2]).toBe(0);
    for (const sprite of sprites) sprite.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    render(f);
    for (const x of [16, 112]) expect(pixel(f, x, 64)[2]).toBeGreaterThan(220);
  });

  it("clips Text with Outside and clears cloned shader state after reparenting", async () => {
    const f = await createFixture();
    f.ui.getComponent(UICanvas)!.referenceResolutionPerUnit = 100;
    const outer = addRect(f.ui, inside, 100);
    const hole = addRect(outer.entity, outside, 20);
    const text = hole.entity.createChild("text").addComponent(Text);
    (text.entity.transform as UITransform).size.set(120, 100);
    text.text = "MMMM";
    text.fontSize = 40;
    text.color.set(1, 0, 0, 1);
    text.raycastEnabled = true;
    render(f);
    const pixels = new Uint8Array(128 * 128 * 4);
    const gl = getGL(f);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visibleGlyphs = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        if (x >= 54 && x < 74) expect(pixels[(y * 128 + x) * 4]).toBe(0);
        else if (pixels[(y * 128 + x) * 4] > 100) visibleGlyphs++;
      }
    }
    expect(visibleGlyphs).toBeGreaterThan(10);
    expectClick(f, text, 64, 64, false);
    expectClick(f, text, 32, 64, true);
    text.enabled = false;
    const source = addImage(f, hole.entity);
    render(f); // Populate ShaderData before cloning.
    const cloneEntity = source.entity.clone();
    outer.entity.addChild(cloneEntity);
    source.enabled = false;
    const clone = cloneEntity.getComponent(Image)!;
    expectVisible(f, clone, 64, 64, true);
    expectVisible(f, clone, 4, 64, false);
  });
});

// Read the camera depth texture through a regular sampler on WebGL2.
function showDepth(f: Fixture, texture: Texture2D): void {
  const overlay = f.ui.parent!.createChild("depth preview").addComponent(UICanvas);
  overlay.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  overlay.referenceResolution.set(128, 128);
  overlay.referenceResolutionPerUnit = 1;
  const shader =
    Shader.find("Test/UIMaskDepthPreview") ??
    Shader.create(`Shader "Test/UIMaskDepthPreview" {
    SubShader "Default" { Pass "Default" {
      Tags { pipelineStage = "Forward" }
      RenderQueueType = Transparent;
      DepthState = { Enabled = false; WriteEnabled = false; }
      RasterState = { CullMode = CullMode.Off; }
      VertexShader = vert; FragmentShader = frag;
      mat4 renderer_MVPMat;
      sampler2D material_DepthPreview;
      struct Attributes { vec3 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 uv; };
      Varyings vert(Attributes attr) {
        Varyings v; v.uv = attr.TEXCOORD_0;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); return v;
      }
      void frag(Varyings v) {
        float d = texture2D(material_DepthPreview, v.uv).r;
        gl_FragColor = vec4(d, d, d, 1.0);
      }
    } }
  }`)!;
  const material = new Material(f.engine, shader);
  material.shaderData.setTexture("material_DepthPreview", texture);
  // Display depth on the lower half; the upper half keeps the Forward color of the same frame.
  const preview = addImage(f, overlay.entity);
  (preview.entity.transform as UITransform).size.set(128, 64);
  preview.entity.transform.setPosition(0, -32, 0);
  preview.setMaterial(material);
}

describe("UI masks in the depth prepass", () => {
  for (const kind of ["opaque", "alpha test", "forward only", "transparent", "3D only"] as const) {
    it(`preserves color and camera depth for ${kind}`, async () => {
      const f = await createFixture(CanvasRenderMode.WorldSpace, false, new ShaderCompiler());
      const writesUIDepth = kind === "opaque" || kind === "alpha test";
      const root = f.ui.parent!;
      const camera = root.findByName("camera")!.getComponent(Camera)!;
      camera.depthTextureMode = DepthTextureMode.PrePass;
      // Blue geometry behind the UI lets a hole reveal a real surface in both textures.
      camera.farClipPlane = 50;
      const mesh = root.createChild("background").addComponent(MeshRenderer);
      mesh.entity.transform.setPosition(64, 64, -20);
      mesh.mesh = PrimitiveMesh.createCuboid(f.engine, 128, 120, 2);
      const blue = new UnlitMaterial(f.engine);
      blue.baseColor.set(0, 0, 1, 1);
      mesh.setMaterial(blue);
      let hole: RectMask2D | undefined;
      if (kind !== "3D only") {
        const shape = f.ui.createChild("image mask").addComponent(Mask);
        shape.sprite = f.sprite;
        (shape.entity.transform as UITransform).size.set(80, 100);
        hole = addRect(shape.entity, outside, 20, -24);
        const image = addImage(f, hole.entity);
        if (writesUIDepth) {
          const red = new UnlitMaterial(f.engine);
          if (kind === "alpha test") red.alphaCutoff = 0.5;
          red.baseColor.set(1, 0, 0, 1);
          image.setMaterial(red);
        } else if (kind === "forward only") {
          const shader =
            Shader.find("Test/UIOpaqueForward") ??
            Shader.create(`Shader "Test/UIOpaqueForward" {
            SubShader "Default" { Pass "Default" {
              Tags { pipelineStage = "Forward" }
              RenderQueueType = Opaque;
              VertexShader = vert; FragmentShader = frag;
              mat4 renderer_MVPMat;
              struct Attributes { vec3 POSITION; };
              void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
              void frag() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }
            } }
          }`)!;
          image.setMaterial(new Material(f.engine, shader));
        }
      }
      render(f);
      const depth = camera.shaderData.getTexture("camera_DepthTexture") as Texture2D;
      expect(depth.format).toBe(writesUIDepth ? TextureFormat.Depth24Stencil8 : TextureFormat.Depth24);
      showDepth(f, depth);
      // Moving the hole swaps the foreground and background samples from the preceding frame.
      hole?.entity.transform.setPosition(0, 0, 0);
      render(f);
      // Both strips sample the same columns: outside the image mask, retained UI, and inside the hole.
      for (const x of [12, 40, 64]) {
        const rgba = pixel(f, x, 80);
        const uiVisible = kind !== "3D only" && x === 40;
        expect([rgba[0], rgba[2]]).toEqual(uiVisible ? [255, 0] : [0, 255]);
        const actual = pixel(f, x, 40)[0] / 255;
        const distance = writesUIDepth && x === 40 ? 10 : 29;
        expect(actual).toBeCloseTo((distance - camera.nearClipPlane) / (50 - camera.nearClipPlane), 2);
      }
    });
  }
});

async function createFixture(
  mode = CanvasRenderMode.ScreenSpaceOverlay,
  stencil = true,
  shaderCompiler?: ShaderCompiler,
  depth = true,
  alpha = true,
  existingDepth = false
): Promise<Fixture> {
  const canvas = document.createElement("canvas");
  canvas.style.width = "128px";
  canvas.style.height = "128px";
  document.body.appendChild(canvas);
  if (existingDepth) canvas.getContext("webgl2", { depth: true, alpha, stencil: false, antialias: false });
  const engine = await WebGLEngine.create({ canvas, shaderCompiler, graphicDeviceOptions: { stencil, depth, alpha } });
  engine.canvas.setResolution(128, 128);
  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor.set(0, 0, 0, 1);
  const root = scene.createRootEntity("root");
  const camera = root.createChild("camera").addComponent(Camera);
  camera.entity.transform.setPosition(64, 64, 10);
  camera.isOrthographic = true;
  camera.orthographicSize = 64;
  const ui = root.createChild("canvas");
  const uiCanvas = ui.addComponent(UICanvas);
  uiCanvas.renderMode = mode;
  uiCanvas.camera = camera;
  uiCanvas.referenceResolution.set(128, 128);
  uiCanvas.referenceResolutionPerUnit = 1;
  if (mode === CanvasRenderMode.WorldSpace) {
    ui.transform.setPosition(64, 64, 0);
    (ui.transform as UITransform).size.set(128, 128);
  }
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  const f = { engine, canvas, ui, sprite: new Sprite(engine, texture), pointerId: 0 };
  fixtures.push(f);
  return f;
}

function addRect(parent: Entity, mode: RectMaskMode, width: number, x = 0): RectMask2D {
  const mask = parent.createChild("rect").addComponent(RectMask2D);
  mask.mode = mode;
  (mask.entity.transform as UITransform).size.set(width, 100);
  mask.entity.transform.setPosition(x, 0, 0);
  return mask;
}

function addImage(f: Fixture, parent: Entity, x = 0): Image {
  const image = parent.createChild("image").addComponent(Image);
  (image.entity.transform as UITransform).size.set(128, 120);
  image.entity.transform.setPosition(x, 0, 0);
  image.sprite = f.sprite;
  image.color.set(1, 0, 0, 1);
  return image;
}

function getGL(f: Fixture): WebGLRenderingContext {
  // @ts-ignore
  return f.engine._hardwareRenderer._gl;
}

function render(f: Fixture): void {
  f.engine.update();
  getGL(f).finish();
}

function pixel(f: Fixture, x: number, y: number): Uint8Array {
  const data = new Uint8Array(4);
  const gl = getGL(f);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return data;
}

function expectVisible(f: Fixture, image: Image, x: number, y: number, visible: boolean, opaque = true): void {
  render(f);
  const color = pixel(f, x, y);
  expect(color[0] > (opaque ? 220 : 0), `render at (${x}, ${y})`).toBe(visible);
  expectClick(f, image, x + 0.5, y + 0.5, visible);
}

function expectClick(f: Fixture, graphic: Image | Text, x: number, y: number, visible: boolean): void {
  const counter = graphic.entity.getComponent(ClickCounter) ?? graphic.entity.addComponent(ClickCounter);
  const before = counter.count;
  const rect = f.canvas.getBoundingClientRect();
  const pointerId = ++f.pointerId;
  for (const type of ["pointerdown", "pointerup"]) {
    f.canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId,
        clientX: rect.left + (x / 128) * rect.width,
        clientY: rect.top + ((128 - y) / 128) * rect.height,
        button: 0,
        buttons: 1
      })
    );
    f.engine.update();
  }
  expect(counter.count - before, `click at (${x}, ${y})`).toBe(visible ? 1 : 0);
}
