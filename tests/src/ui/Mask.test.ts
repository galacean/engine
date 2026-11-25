import {
  Camera,
  Entity,
  Script,
  Sprite,
  SpriteMask,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  SpriteRenderer,
  Texture2D,
  TextureFilterMode
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { CanvasRenderMode, Image, Mask, RectMask2D, Text, UICanvas, UITransform } from "@galacean/engine-ui";
import { afterEach, describe, expect, it } from "vitest";

class ClickCounter extends Script {
  count = 0;
  override onPointerClick(): void {
    this.count++;
  }
}

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const fixture of fixtures) {
    fixture.engine.destroy();
    fixture.canvas.remove();
  }
  fixtures.length = 0;
});

describe("UI Mask hierarchy", () => {
  for (const mode of [
    CanvasRenderMode.ScreenSpaceOverlay,
    CanvasRenderMode.ScreenSpaceCamera,
    CanvasRenderMode.WorldSpace
  ]) {
    it(`clips descendants by the intersection of ancestors in canvas mode ${mode}`, async () => {
      const f = await createFixture(mode);
      const outer = addMask(f, f.ui, 64, 80, -16);
      const inner = addMask(f, outer.entity, 64, 80, 32);
      const image = addImage(f, inner.entity, 128, 100, -16);
      // Outer covers x=16..80, inner covers x=48..112. Only x=48..80 is visible.
      expectVisible(f, image, 64, 64, true);
      expectVisible(f, image, 32, 64, false);
      expectVisible(f, image, 96, 64, false);
      // Run another frame to catch stale stencil counts and reused mask batches.
      expectVisible(f, image, 64, 64, true);
    });
  }

  it("uses the eighth image-mask bit and complements the full intersection", async () => {
    const f = await createFixture();
    let parent = f.ui;
    for (let i = 0; i < 8; i++) parent = addMask(f, parent, i === 7 ? 40 : 100, 100).entity;
    const image = addImage(f, parent, 128, 120);
    expectVisible(f, image, 64, 64, true);
    expectVisible(f, image, 32, 64, false);
    image.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 32, 64, true);
    expectVisible(f, image, 4, 64, true);
  });

  it("renders Overlay masks without a camera and after resizing", async () => {
    const f = await createFixture();
    f.root.findByName("camera")!.getComponent(Camera)!.enabled = false;
    const mask = addMask(f, f.ui, 40, 40);
    mask.entity.transform.setPosition(0, 24, 0);
    const image = addImage(f, mask.entity, 120, 100);
    expectVisible(f, image, 64, 88, true);
    expectVisible(f, image, 64, 40, false);
    f.engine.canvas.setResolution(256, 256);
    render(f);
    expect(pixel(f, 128, 176)[0]).toBeGreaterThan(220);
    expect(pixel(f, 128, 80)[0]).toBeLessThan(20);
  });

  it("preserves the scene background and translucent Overlay blending", async () => {
    const f = await createFixture();
    f.engine.sceneManager.activeScene.background.solidColor.set(0.2, 0.4, 0.6, 1);
    const mask = addMask(f, f.ui, 40, 80);
    const image = addImage(f, mask.entity, 120, 100);
    image.color.a = 0.5;
    mask.enabled = false;
    render(f);
    const unmasked = pixel(f, 64, 64);
    image.enabled = false;
    render(f);
    const background = pixel(f, 20, 64);
    image.enabled = mask.enabled = true;
    render(f);
    const masked = pixel(f, 64, 64);
    const outside = pixel(f, 20, 64);
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(masked[i] - unmasked[i])).toBeLessThanOrEqual(2);
      expect(Math.abs(outside[i] - background[i])).toBeLessThanOrEqual(2);
    }
  });

  it("updates ancestry when a mask is added and intersects disjoint shapes", async () => {
    const f = await createFixture();
    const parent = f.ui.createChild("lateMask");
    parent.addComponent(UITransform).size.set(40, 80);
    const image = addImage(f, parent, 120, 100);
    expectVisible(f, image, 20, 64, true);
    const outer = parent.addComponent(Mask);
    outer.sprite = f.sprite;
    expectVisible(f, image, 20, 64, false);
    const inner = addMask(f, parent, 20, 80, 50);
    image.entity.parent = inner.entity;
    image.entity.transform.setPosition(-50, 0, 0);
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 114, 64, false);
    inner.entity.transform.setPosition(0, 0, 0);
    image.entity.transform.setPosition(0, 0, 0);
    expectVisible(f, image, 64, 64, true);
  });

  it("does not mask a sibling or a graphic on the mask's own entity", async () => {
    const f = await createFixture();
    const mask = addMask(f, f.ui, 32, 80, -32);
    const sibling = addImage(f, f.ui, 32, 60, 32);
    expectVisible(f, sibling, 96, 64, true);
    sibling.enabled = false;
    const sameEntity = mask.entity.addComponent(Image);
    sameEntity.sprite = f.sprite;
    sameEntity.color.set(1, 0, 0, 1);
    mask.sprite = null;
    expectVisible(f, sameEntity, 32, 64, true);
  });

  it("does not batch graphics with different ancestor chains", async () => {
    const f = await createFixture();
    const left = addMask(f, f.ui, 24, 80, -32);
    const right = addMask(f, f.ui, 24, 80, 32);
    const a = addImage(f, left.entity, 60, 100);
    const b = addImage(f, right.entity, 60, 100);
    expectVisible(f, a, 32, 64, true);
    expectVisible(f, b, 96, 64, true);
    expectVisible(f, a, 10, 64, false);
    expectVisible(f, b, 118, 64, false);
  });

  it("updates rendering and picking after reparenting, disabling, re-enabling and destroying a mask", async () => {
    const f = await createFixture();
    const mask = addMask(f, f.ui, 40, 80);
    const image = addImage(f, mask.entity, 120, 100);
    expectVisible(f, image, 20, 64, false);
    image.entity.parent = f.ui;
    expectVisible(f, image, 20, 64, true);
    image.entity.parent = mask.entity;
    expectVisible(f, image, 20, 64, false);
    mask.enabled = false;
    expectVisible(f, image, 20, 64, true);
    mask.enabled = true;
    expectVisible(f, image, 20, 64, false);
    mask.destroy();
    expectVisible(f, image, 20, 64, true);
  });

  it("does not leak a nested mask into the next sibling under the outer mask", async () => {
    const f = await createFixture();
    const outer = addMask(f, f.ui, 100, 100);
    const inner = addMask(f, outer.entity, 20, 100, -30);
    const a = addImage(f, inner.entity, 40, 80);
    const b = addImage(f, outer.entity, 40, 80, 30);
    expectVisible(f, a, 34, 64, true);
    expectVisible(f, b, 94, 64, true);
  });

  it("keeps independently sorted root canvases isolated", async () => {
    const f = await createFixture();
    const mask = addMask(f, f.ui, 20, 80, -32);
    const first = addImage(f, mask.entity, 50, 100);
    const secondCanvas = f.root.createChild("secondCanvas").addComponent(UICanvas);
    secondCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    secondCanvas.referenceResolution.set(128, 128);
    secondCanvas.referenceResolutionPerUnit = 1;
    secondCanvas.sortOrder = 1;
    const second = addImage(f, secondCanvas.entity, 40, 80, 32);
    expectVisible(f, first, 32, 64, true);
    expectVisible(f, second, 96, 64, true);
    expectVisible(f, first, 12, 64, false);
  });

  it("combines UI Mask and RectMask2D", async () => {
    const f = await createFixture();
    const mask = addMask(f, f.ui, 64, 80, -16);
    const rectEntity = mask.entity.createChild("rect");
    const rect = rectEntity.addComponent(RectMask2D);
    (rectEntity.transform as UITransform).size.set(64, 80);
    rectEntity.transform.setPosition(32, 0, 0);
    const image = addImage(f, rectEntity, 128, 100, -16);
    expectVisible(f, image, 64, 64, true);
    expectVisible(f, image, 32, 64, false);
    expectVisible(f, image, 96, 64, false);
    rect.enabled = false;
    expectVisible(f, image, 32, 64, true);
  });

  it("applies alpha cutoff and flipping in rendering while picking uses mask rect without readPixels", async () => {
    const f = await createFixture();
    const mask = addMask(f, f.ui, 80, 80);
    const texture = new Texture2D(f.engine, 2, 1);
    texture.filterMode = TextureFilterMode.Point;
    texture.setPixelBuffer(new Uint8Array([255, 255, 255, 0, 255, 255, 255, 128]));
    mask.sprite = new Sprite(f.engine, texture);
    const image = addImage(f, mask.entity, 120, 100);

    mask.alphaCutoff = 0.25;
    render(f);
    expect(pixel(f, 40, 64)[0]).toBeLessThan(20);
    expect(pixel(f, 88, 64)[0]).toBeGreaterThan(220);

    mask.flipX = true;
    render(f);
    expect(pixel(f, 40, 64)[0]).toBeGreaterThan(220);
    expect(pixel(f, 88, 64)[0]).toBeLessThan(20);

    mask.alphaCutoff = 0.75;
    render(f);
    expect(pixel(f, 40, 64)[0]).toBeLessThan(20);

    // Raycast filtering uses the mask's rectangular plane bounds without calling gl.readPixels.
    // @ts-ignore
    const gl = f.engine._hardwareRenderer._gl as WebGL2RenderingContext;
    const origReadPixels = gl.readPixels.bind(gl);
    let readPixelsCalls = 0;
    gl.readPixels = ((...args: any[]) => {
      readPixelsCalls++;
      return (origReadPixels as any)(...args);
    }) as any;
    try {
      expectClick(f, image, 40, 64, true);
      expectClick(f, image, 88, 64, true);
      expectClick(f, image, 10, 64, false);
    } finally {
      gl.readPixels = origReadPixels;
    }
    expect(readPixelsCalls).toBe(0);
  });

  it("handles empty, missing and offscreen ancestor shapes without stale stencil", async () => {
    const f = await createFixture();
    const mask = addMask(f, f.ui, 60, 80);
    const image = addImage(f, mask.entity, 120, 100);
    expectVisible(f, image, 64, 64, true);
    mask.sprite = null;
    expectVisible(f, image, 64, 64, false);
    mask.sprite = f.sprite;
    const transform = mask.entity.transform as UITransform;
    transform.size.x = 0;
    expectVisible(f, image, 64, 64, false);
    transform.size.x = 60;
    expectVisible(f, image, 64, 64, true);
    transform.setPosition(300, 0, 0);
    image.entity.transform.setPosition(-300, 0, 0);
    expectVisible(f, image, 64, 64, false);
  });

  it("applies explicit Outside and None modes to the ancestor intersection only", async () => {
    const f = await createFixture();
    const outer = addMask(f, f.ui, 64, 80, -16);
    const inner = addMask(f, outer.entity, 64, 80, 32);
    const image = addImage(f, inner.entity, 128, 100, -16);
    image.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    expectVisible(f, image, 64, 64, false);
    expectVisible(f, image, 32, 64, true);
    expectVisible(f, image, 96, 64, true);
    image.maskInteraction = SpriteMaskInteraction.None;
    expectVisible(f, image, 64, 64, true);
    image.entity.parent = f.ui;
    image.entity.transform.setPosition(0, 0, 0);
    image.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    expectVisible(f, image, 64, 64, true);
  });

  it("preserves SpriteMask layer selection and does not let UI Masks affect sprites", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera);
    // UI is drawn between two sprite draws, exercising stencil ownership in both directions.
    const spriteMaskEntity = f.root.createChild("spriteMask");
    spriteMaskEntity.transform.setPosition(64, 64, 0);
    const spriteMask = spriteMaskEntity.addComponent(SpriteMask);
    spriteMask.sprite = f.sprite;
    spriteMask.width = 128;
    spriteMask.height = 128;
    spriteMask.influenceLayers = SpriteMaskLayer.Layer1;
    const makeSprite = (x: number, priority: number) => {
      const entity = f.root.createChild("sprite");
      entity.transform.setPosition(x, 64, 0);
      const renderer = entity.addComponent(SpriteRenderer);
      renderer.sprite = f.sprite;
      renderer.width = 20;
      renderer.height = 80;
      renderer.color.set(0, 0, 1, 1);
      renderer.priority = priority;
      renderer.maskLayer = SpriteMaskLayer.Layer1;
      renderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
      return renderer;
    };
    const before = makeSprite(16, -1);
    const after = makeSprite(112, 1);
    const uiMask = addMask(f, f.ui, 20, 80);
    const image = addImage(f, uiMask.entity, 60, 100);
    expectVisible(f, image, 64, 64, true);
    expectVisible(f, image, 44, 64, false); // SpriteMask must not reveal this UI pixel.
    expect(pixel(f, 16, 64)[2]).toBeGreaterThan(220);
    expect(pixel(f, 112, 64)[2]).toBeGreaterThan(220);
    before.maskLayer = SpriteMaskLayer.Layer0;
    after.maskLayer = SpriteMaskLayer.Layer0;
    render(f);
    expect(pixel(f, 16, 64)[2]).toBeLessThan(20);
    expect(pixel(f, 112, 64)[2]).toBeLessThan(20);
    before.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
    render(f);
    expect(pixel(f, 16, 64)[2]).toBeGreaterThan(220);
  });

  it("clips Text glyphs as well as Image and uses the same picking area", async () => {
    const f = await createFixture();
    const mask = addMask(f, f.ui, 20, 100);
    const entity = mask.entity.createChild("text");
    const text = entity.addComponent(Text);
    (entity.transform as UITransform).size.set(120, 100);
    text.text = "MMMM";
    text.raycastEnabled = true;
    text.fontSize = 40;
    f.ui.getComponent(UICanvas)!.referenceResolutionPerUnit = 100;
    text.color.set(1, 0, 0, 1);
    render(f);
    let insidePixels = 0;
    let outsidePixels = 0;
    // Read once so the glyph check does not synchronize the GPU for each pixel.
    const pixels = new Uint8Array(128 * 128 * 4);
    // @ts-ignore
    const gl = f.engine._hardwareRenderer._gl;
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let y = 0; y < 128; y++) {
      for (let x = 4; x < 124; x++) {
        if (pixels[(y * 128 + x) * 4] > 100) {
          if (x >= 54 && x < 74) insidePixels++;
          else outsidePixels++;
        }
      }
    }
    expect(insidePixels).toBeGreaterThan(10);
    expect(outsidePixels).toBe(0);
    expectClick(f, text, 64, 64, true);
    expectClick(f, text, 32, 64, false);
  });

  it("clones mask resources and rebuilds descendant ancestry", async () => {
    const f = await createFixture();
    const source = addMask(f, f.ui, 20, 80, -32);
    source.alphaCutoff = 0.3;
    source.flipX = true;
    addImage(f, source.entity, 50, 100);
    const references = f.sprite.refCount;
    const cloneEntity = source.entity.clone();
    f.ui.addChild(cloneEntity);
    cloneEntity.transform.setPosition(32, 0, 0);
    const clone = cloneEntity.getComponent(Mask)!;
    const image = cloneEntity.children[0].getComponent(Image)!;
    expect(clone.sprite).toBe(f.sprite);
    expect(f.sprite.refCount).toBe(references + 2);
    expect(clone.alphaCutoff).toBe(0.3);
    expect(clone.flipX).toBe(true);
    expect(clone._renderElement).not.toBe(source._renderElement);
    expect(clone._subChunk).not.toBe(source._subChunk);
    expectVisible(f, image, 96, 64, true);
    expectVisible(f, image, 116, 64, false);
    cloneEntity.destroy();
    expect(f.sprite.refCount).toBe(references);
  });

  it("handles singular mask transforms (scale.z=0 and scale.x=0) without reusing stale raycast state", async () => {
    const f = await createFixture();
    const leftMask = addMask(f, f.ui, 30, 80, -32);
    const leftImage = addImage(f, leftMask.entity, 128, 100, 32);

    const rightMask = addMask(f, f.ui, 30, 80, 32);
    rightMask.entity.transform.setScale(1, 1, 0);
    const rightImage = addImage(f, rightMask.entity, 128, 100, -32);

    rightImage.enabled = false;
    expectVisible(f, leftImage, 32, 64, true);

    leftImage.enabled = false;
    rightImage.enabled = true;
    expectVisible(f, rightImage, 96, 64, true);
    expectVisible(f, rightImage, 32, 64, false);

    rightMask.entity.transform.setScale(0, 1, 1);
    expectVisible(f, rightImage, 96, 64, false);
    expectVisible(f, rightImage, 32, 64, false);
  });

  it("picks Overlay descendants by screen XY when the mask or receiver moves in Z", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceOverlay);
    const mask = addMask(f, f.ui, 60, 80);
    const image = addImage(f, mask.entity, 100, 80);
    for (const [maskZ, imageZ] of [
      [0, 0],
      [10, -10],
      [10, 0],
      [1, 0],
      [-10, 0]
    ]) {
      mask.entity.transform.setPosition(0, 0, maskZ);
      image.entity.transform.setPosition(0, 0, imageZ);
      expectVisible(f, image, 64, 64, true);
      expectVisible(f, image, 24, 64, false);
    }
  });

  it("picks a flat UI plane away from the center of a perspective camera", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.root.findByName("camera")!.getComponent(Camera)!;
    camera.isOrthographic = false;
    camera.fieldOfView = 90;
    camera.farClipPlane = 512;
    camera.entity.transform.setPosition(64, 64, 128);
    const mask = addMask(f, f.ui, 120, 100);
    const image = addImage(f, mask.entity, 40, 60, 32);
    for (const zScale of [1, 0]) {
      mask.entity.transform.setScale(1, 1, zScale);
      expectVisible(f, image, 80, 64, true);
      expectVisible(f, image, 55, 64, false);
    }
  });

  it("clips each mask to the camera ray segment before intersecting or complementing the masks", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.root.findByName("camera")!.getComponent(Camera)!;
    camera.nearClipPlane = 1;
    camera.farClipPlane = 20;
    const outer = addMask(f, f.ui, 100, 100);
    const inner = addMask(f, outer.entity, 80, 80);
    const image = addImage(f, inner.entity, 80, 80);
    for (const z of [-30, 9.5, 0]) {
      // The receiver stays ten units from the camera as the inner mask crosses either clip plane.
      inner.entity.transform.setPosition(0, 0, z);
      image.entity.transform.setPosition(0, 0, -z);
      image.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
      expectVisible(f, image, 64, 64, z === 0);
      image.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
      expectVisible(f, image, 64, 64, z !== 0);
    }
  });

  it("clips a tilted mask per pixel where it crosses the far plane", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.root.findByName("camera")!.getComponent(Camera)!;
    camera.farClipPlane = 20;
    const mask = addMask(f, f.ui, 80, 80);
    mask.entity.transform.setPosition(0, 0, -10);
    mask.entity.transform.setRotation(0, 45, 0);
    const image = addImage(f, mask.entity, 100, 100);
    // Undo the ancestor rotation and translation so the receiver remains in view on both sides.
    image.entity.transform.setRotation(0, -45, 0);
    image.entity.transform.setPosition(-Math.SQRT1_2 * 10, 0, Math.SQRT1_2 * 10);
    expectVisible(f, image, 56, 64, true);
    expectVisible(f, image, 72, 64, false);
  });

  it("retains mask hits near the perspective far plane at an oblique screen angle", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.root.findByName("camera")!.getComponent(Camera)!;
    camera.isOrthographic = false;
    camera.fieldOfView = 90;
    camera.nearClipPlane = 1;
    camera.farClipPlane = 20;
    const mask = addMask(f, f.ui, 100, 100);
    mask.entity.transform.setPosition(0, 0, -9);
    const image = addImage(f, mask.entity, 80, 80);
    // Axis depth is 19, but the hit is farther than 20 units along this pixel's oblique ray.
    expectVisible(f, image, 112, 64, true);
  });

  it("matches perspective rendering and raycast picking for non-coplanar masks", async () => {
    const f = await createFixture(CanvasRenderMode.WorldSpace);
    const camera = f.root.findByName("camera")!.getComponent(Camera)!;
    camera.isOrthographic = false;
    camera.fieldOfView = 90;
    camera.farClipPlane = 512;
    camera.entity.transform.setPosition(64, 64, 128);

    const mask = addMask(f, f.ui, 40, 100);
    const image = addImage(f, mask.entity, 128, 120);
    image.entity.transform.setPosition(0, 0, 64);

    // At x=48 the camera ray hits mask plane z=0 at world x=32 (outside 44..84),
    // even though it hits image plane z=64 at world x=48.
    expectVisible(f, image, 48, 64, false);
    expectVisible(f, image, 64, 64, true);
  });

  it("uploads only the mask chunk index buffer when drawing nested UI Masks", async () => {
    const f = await createFixture(CanvasRenderMode.ScreenSpaceCamera);
    const spriteEntity = f.root.createChild("sprite2d");
    const spriteRenderer = spriteEntity.addComponent(SpriteRenderer);
    spriteRenderer.sprite = f.sprite;

    let parent = f.ui;
    for (let i = 0; i < 4; i++) {
      parent = addMask(f, parent, 100, 100).entity;
    }
    addImage(f, parent, 100, 100);
    render(f);

    // @ts-ignore
    const gl = f.engine._hardwareRenderer._gl as WebGL2RenderingContext;
    // @ts-ignore
    const bm = f.engine._batcherManager;
    // @ts-ignore
    const uiIB =
      bm._primitiveChunkManagerUI.primitiveChunks[0].primitive.indexBufferBinding.buffer._platformBuffer._glBuffer;
    // @ts-ignore
    const d2IB =
      bm._primitiveChunkManager2D.primitiveChunks[0].primitive.indexBufferBinding.buffer._platformBuffer._glBuffer;
    // @ts-ignore
    const maskIB =
      bm._primitiveChunkManagerMask.primitiveChunks[0].primitive.indexBufferBinding.buffer._platformBuffer._glBuffer;

    const origBufferData = gl.bufferData.bind(gl);
    const origBufferSubData = gl.bufferSubData.bind(gl);
    const counts = { uiDiscard: 0, uiBytes: 0, d2Discard: 0, d2Bytes: 0, maskDiscard: 0, maskBytes: 0 };

    gl.bufferData = ((target: number, ...args: any[]) => {
      if (target === gl.ELEMENT_ARRAY_BUFFER) {
        const bound = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        if (bound === uiIB) counts.uiDiscard++;
        else if (bound === d2IB) counts.d2Discard++;
        else if (bound === maskIB) counts.maskDiscard++;
      }
      return (origBufferData as any)(target, ...args);
    }) as any;

    gl.bufferSubData = ((
      target: number,
      offset: number,
      data: ArrayBufferView,
      srcOffset?: number,
      length?: number
    ) => {
      if (target === gl.ELEMENT_ARRAY_BUFFER) {
        const bound = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        const bytes = length !== undefined ? length * (data as Uint16Array).BYTES_PER_ELEMENT : data.byteLength;
        if (bound === uiIB) counts.uiBytes += bytes;
        else if (bound === d2IB) counts.d2Bytes += bytes;
        else if (bound === maskIB) counts.maskBytes += bytes;
      }
      return (origBufferSubData as any)(target, offset, data, srcOffset, length);
    }) as any;

    try {
      render(f);
    } finally {
      gl.bufferData = origBufferData;
      gl.bufferSubData = origBufferSubData;
    }

    expect(counts.uiDiscard).toBe(1);
    expect(counts.uiBytes).toBe(12);
    expect(counts.d2Discard).toBe(1);
    expect(counts.d2Bytes).toBe(12);
    expect(counts.maskDiscard).toBe(4);
    expect(counts.maskBytes).toBe(48);
  });
});

interface Fixture {
  engine: WebGLEngine;
  canvas: HTMLCanvasElement;
  root: Entity;
  ui: Entity;
  sprite: Sprite;
  pointerId: number;
}

async function createFixture(mode = CanvasRenderMode.ScreenSpaceOverlay): Promise<Fixture> {
  const canvas = document.createElement("canvas");
  canvas.style.width = "128px";
  canvas.style.height = "128px";
  document.body.appendChild(canvas);
  const engine = await WebGLEngine.create({ canvas });
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
  const fixture = { engine, canvas, root, ui, sprite: new Sprite(engine, texture), pointerId: 0 };
  fixtures.push(fixture);
  return fixture;
}

function addMask(f: Fixture, parent: Entity, width: number, height: number, x = 0): Mask {
  const mask = parent.createChild("mask").addComponent(Mask);
  const transform = mask.entity.transform as UITransform;
  transform.size.set(width, height);
  transform.setPosition(x, 0, 0);
  mask.sprite = f.sprite;
  return mask;
}

function addImage(f: Fixture, parent: Entity, width: number, height: number, x = 0): Image {
  const image = parent.createChild("image").addComponent(Image);
  const transform = image.entity.transform as UITransform;
  transform.size.set(width, height);
  transform.setPosition(x, 0, 0);
  image.sprite = f.sprite;
  image.color.set(1, 0, 0, 1);
  return image;
}

function render(f: Fixture): void {
  f.engine.update();
  // @ts-ignore
  f.engine._hardwareRenderer._gl.finish();
}

function pixel(f: Fixture, x: number, y: number): Uint8Array {
  const data = new Uint8Array(4);
  // @ts-ignore
  const gl = f.engine._hardwareRenderer._gl;
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return data;
}

function expectVisible(f: Fixture, image: Image, x: number, y: number, visible: boolean): void {
  render(f);
  const color = pixel(f, x, y);
  expect(color[0] > 220 && color[1] < 20 && color[2] < 20, `render at (${x}, ${y})`).toBe(visible);
  expectClick(f, image, x, y, visible);
}

function expectClick(f: Fixture, graphic: Image | Text, x: number, y: number, visible: boolean): void {
  const counter = graphic.entity.getComponent(ClickCounter) ?? graphic.entity.addComponent(ClickCounter);
  const before = counter.count;
  const rect = f.canvas.getBoundingClientRect();
  const pointerId = ++f.pointerId;
  const clientX = rect.left + (x / 128) * rect.width;
  const clientY = rect.top + ((128 - y) / 128) * rect.height;
  for (const type of ["pointerdown", "pointerup"]) {
    f.canvas.dispatchEvent(new PointerEvent(type, { pointerId, clientX, clientY, button: 0, buttons: 1 }));
    f.engine.update();
  }
  expect(counter.count - before, `click at (${x}, ${y})`).toBe(visible ? 1 : 0);
}
