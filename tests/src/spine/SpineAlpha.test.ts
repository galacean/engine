import { Camera, Color, Texture2D, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpineResource } from "../../../packages/spine/src/loader/SpineResource";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";
import { registerSpineRuntime } from "../../../packages/spine/src/runtime/SpineRuntimeRegistry";
import { normalizeSpineTexture } from "../../../packages/spine/src/loader/SpineTextureNormalization";
import { Spine38Runtime } from "../../../packages/spine-core-3.8/src/Spine38Runtime";
import { Spine42Runtime } from "../../../packages/spine-core-4.2/src/Spine42Runtime";
import "../../../packages/spine/src/loader/SpineLoader";

registerSpineRuntime(new Spine38Runtime());
registerSpineRuntime(new Spine42Runtime());
const url = (name: string) => new URL(`./fixtures/${name}`, import.meta.url).href;
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSRGB = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

describe("Spine atlas alpha encoding", () => {
  let engine: WebGLEngine;
  let canvas: HTMLCanvasElement;
  let camera: Camera;

  beforeEach(async () => {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    engine = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { preserveDrawingBuffer: true }
    });
    const entity = engine.sceneManager.activeScene.createRootEntity();
    entity.transform.setPosition(0, 0, 3);
    camera = entity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 4;
    camera.enableHDR = false;
    engine.sceneManager.activeScene.background.solidColor = new Color(0.3, 0.3, 0.3, 1);
  });
  afterEach(() => engine.destroy());

  function pixels(): Uint8Array {
    engine.update();
    const gl = canvas.getContext("webgl2")!;
    const result = new Uint8Array(128 * 128 * 4);
    gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, result);
    expect(gl.getError()).to.equal(0);
    return result;
  }

  async function load(version: string, suffix = "") {
    return engine.resourceManager.load<SpineResource>({
      type: "Spine",
      urls: [url(`alpha-${version}.json`) + suffix, url("alpha.atlas")]
    });
  }

  function attach(resource: SpineResource) {
    const entity = resource.instantiate();
    engine.sceneManager.activeScene.addRootEntity(entity);
    const renderer = entity.getComponent(SpineAnimationRenderer);
    renderer.timeScale = 0;
    return renderer;
  }

  for (const version of ["3.8", "4.2"]) {
    it(`${version}: matches straight exports through fades, tint, four blend modes and mip filtering`, async () => {
      const background = toLinear(pixels()[0] / 255);
      const renderer = attach(await load(version));
      const entry = renderer.state.setAnimation(0, "fade", false);
      for (const tint of [false, true]) {
        renderer.tintBlack = tint;
        for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
          entry.trackTime = alpha;
          renderer.skeleton.setSkinByName("default");
          renderer.skeleton.setSlotsToSetupPose();
          const pma = pixels();
          renderer.skeleton.setSkinByName("straight");
          renderer.skeleton.setSlotsToSetupPose();
          const straight = pixels();
          expect(pma).to.deep.equal(straight);

          const a = alpha * (128 / 255);
          const gray = toLinear(128 / 255);
          const color = gray * gray + (tint ? (1 - gray) * toLinear(64 / 255) : 0);
          const source = color * a;
          const expected = [
            source + background * (1 - a),
            source + background,
            source * background + background * (1 - a),
            source + background * (1 - source)
          ];
          [16, 48, 80, 112].forEach((x, i) => {
            expect(pma[(64 * 128 + x) * 4]).to.be.closeTo(toSRGB(expected[i]), 2);
          });
        }
      }
      // Minification samples mip levels, including the transparent border around each region.
      camera.orthographicSize = 16;
      renderer.skeleton.setSkinByName("default");
      renderer.skeleton.setSlotsToSetupPose();
      const pma = pixels();
      renderer.skeleton.setSkinByName("straight");
      renderer.skeleton.setSlotsToSetupPose();
      expect(pixels()).to.deep.equal(pma);
    });
  }

  it("shares conversions without changing the source, restores their content and releases them with resources", async () => {
    const a = await load("3.8");
    const b = await load("4.2");
    const textures = (resource: SpineResource) => resource._runtime.getTextures(resource.skeletonData._native);
    const converted = textures(a)[0];
    expect(textures(b)[0]).to.equal(converted);
    const source = await engine.resourceManager.load<Texture2D>(url("alpha-pma.png"));
    expect(source).not.to.equal(converted);
    const original = new Uint8Array(8 * 8 * 4);
    source.getPixelBuffer(original);
    expect(Array.from(original.slice((3 * 8 + 3) * 4, (3 * 8 + 3) * 4 + 4))).to.deep.equal([64, 64, 64, 128]);
    const before = new Uint8Array(8 * 8 * 4);
    converted.getPixelBuffer(before);
    const lost = new Promise<void>((resolve) => engine.once("devicelost", resolve));
    engine.forceLoseDevice();
    await lost;
    // WEBGL_lose_context makes restoration available on a later browser task.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const restored = new Promise<void>((resolve) => engine.once("devicerestored", resolve));
    engine.forceRestoreDevice();
    await restored;
    const after = new Uint8Array(before.length);
    converted.getPixelBuffer(after);
    expect(after).to.deep.equal(before);
    const renderer = attach(a);
    pixels();
    engine.resourceManager.gc();
    expect(converted.destroyed).to.equal(false);
    expect(converted.pendingDestroy).to.equal(false);
    renderer.entity.destroy();
    engine.update();
    engine.resourceManager.gc();
    engine.update();
    expect(converted.destroyed).to.equal(true);
  });

  it("accepts asset import overrides for legacy atlases without PMA metadata", async () => {
    const pma = await engine.resourceManager.load<Texture2D>(url("alpha-pma.png"));
    const straight = await engine.resourceManager.load<Texture2D>(url("alpha-straight.png"));
    const resource = await engine.resourceManager.load<SpineResource>({
      type: "Spine",
      urls: [url("3.8.json"), url("3.8.atlas"), url("alpha-pma.png"), url("alpha-straight.png")],
      params: { alphaMode: { "page.png": "premultiplied" } }
    });
    const textures = resource._runtime.getTextures(resource.skeletonData._native);
    expect(textures[0]).to.equal(normalizeSpineTexture(pma));
    expect(textures[1]).to.equal(straight);

    const alreadyConverted = await engine.resourceManager.load<SpineResource>({
      type: "Spine",
      urls: [url("alpha-4.2.json"), url("alpha.atlas"), url("alpha-straight.png"), url("alpha-straight.png")],
      params: { alphaMode: "straight" }
    });
    expect(alreadyConverted._runtime.getTextures(alreadyConverted.skeletonData._native)).to.deep.equal([straight]);
  });
});
