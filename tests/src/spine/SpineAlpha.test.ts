import { Camera, Color, MeshRenderer, PrimitiveMesh, Texture2D, UnlitMaterial, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpineResource } from "../../../packages/spine/src/loader/SpineResource";
import { SpineAnimationRenderer } from "../../../packages/spine/src/renderer/SpineAnimationRenderer";
import { registerSpineRuntime } from "../../../packages/spine/src/runtime/SpineRuntimeRegistry";
import { Spine38Runtime } from "../../../packages/spine-core-3.8/src/Spine38Runtime";
import { Spine42Runtime } from "../../../packages/spine-core-4.2/src/Spine42Runtime";
import "../../../packages/spine/src/loader/SpineLoader";

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
      spine: new Spine38Runtime(),
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { preserveDrawingBuffer: true }
    });
    registerSpineRuntime(engine, new Spine42Runtime());
    const entity = engine.sceneManager.activeScene.createRootEntity();
    entity.transform.setPosition(0, 0, 3);
    camera = entity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 4;
    camera.enableHDR = false;
    engine.sceneManager.activeScene.background.solidColor = new Color(0.3, 0.3, 0.3, 1);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    engine.destroy();
  });

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
      urls: [url(`alpha-${version}.json`) + suffix, url("alpha-straight.atlas")]
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
    it(`${version}: renders straight-alpha textures with fades, tint and all blend modes`, async () => {
      const background = toLinear(pixels()[0] / 255);
      const renderer = attach(await load(version));
      const entry = renderer.state.setAnimation(0, "fade", false);
      for (const tint of [false, true]) {
        renderer.tintBlack = tint;
        for (const alpha of [0, 0.25, 0.5, 0.75, 1]) {
          entry.trackTime = alpha;
          const result = pixels();
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
            expect(result[(64 * 128 + x) * 4]).to.be.closeTo(toSRGB(expected[i]), 2);
          });
        }
      }
    });

    it(`${version}: rejects PMA atlas pages with export instructions`, async () => {
      await expect(
        engine.resourceManager.load<SpineResource>({
          type: "Spine",
          urls: [url(`alpha-${version}.json`), url("alpha.atlas")]
        })
      ).rejects.toThrow('Spine atlas page "alpha-pma.png" uses premultiplied alpha');
      expect(engine.resourceManager.getFromCache(url("alpha-pma.png"))).to.be.null;
    });
  }

  it("clears Spine batch data when an ordinary renderer reuses the draw element", async () => {
    const renderer = attach(await load("4.2"));
    pixels();
    const queue = camera._renderPipeline._cullingResults.transparentQueue;
    const spineElement = queue.elements[0];
    expect(spineElement.component).to.equal(renderer);
    expect(spineElement.shaderData).not.to.be.undefined;

    renderer.entity.destroy();
    const meshRenderer = engine.sceneManager.activeScene.createRootEntity().addComponent(MeshRenderer);
    meshRenderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1);
    const material = new UnlitMaterial(engine);
    material.baseColor.set(0, 1, 0, 1);
    meshRenderer.setMaterial(material);
    const result = pixels();
    const meshElement = camera._renderPipeline._cullingResults.opaqueQueue.elements[0];
    expect(meshElement === spineElement).to.be.true;
    expect(meshElement.component).to.equal(meshRenderer);
    expect(meshElement.shaderData).to.be.undefined;
    expect(Array.from(result.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 3))).to.deep.equal([0, 255, 0]);
  });

  it("shares original textures and restores assets loaded before and during device loss without readback", async () => {
    const readback = vi.spyOn(Texture2D.prototype, "getPixelBuffer");
    const a = await load("3.8");
    const b = await load("4.2");
    const textures = (resource: SpineResource) => resource._runtime.getTextures(resource.skeletonData._native);
    const source = await engine.resourceManager.load<Texture2D>(url("alpha-straight.png"));
    expect(textures(a)[0]).to.equal(source);
    expect(textures(b)[0]).to.equal(source);
    expect(source.isSRGBColorSpace).to.equal(true);
    const renderer = attach(a);
    const before = pixels();
    const lost = new Promise<void>((resolve) => engine.once("devicelost", resolve));
    engine.forceLoseDevice();
    await lost;
    const loadedWhileLost = await engine.resourceManager.load<SpineResource>({
      type: "Spine",
      urls: [url("alpha-4.2.json") + "?lost", url("alpha-straight.atlas"), url("alpha-straight.png") + "?lost"]
    });
    expect(textures(loadedWhileLost)[0]).not.to.equal(source);
    // WEBGL_lose_context makes restoration available on a later browser task.
    await new Promise((resolve) => setTimeout(resolve, 100));
    const restored = new Promise<void>((resolve) => engine.once("devicerestored", resolve));
    engine.forceRestoreDevice();
    await restored;
    // Core cleanup of old-context shader programs can leave INVALID_OPERATION.
    // Clear it before checking the restored draw for errors and pixel correctness.
    canvas.getContext("webgl2")!.getError();
    expect(pixels()).to.deep.equal(before);
    renderer.resource = loadedWhileLost;
    expect(pixels()).to.deep.equal(before);
    expect(readback).not.toHaveBeenCalled();

    renderer.resource = a;
    engine.resourceManager.gc();
    expect(source.destroyed).to.equal(false);
    expect(source.pendingDestroy).to.equal(false);
    renderer.entity.destroy();
    engine.update();
    engine.resourceManager.gc();
    engine.update();
    expect(source.destroyed).to.equal(true);
  });

  it("rejects a shared texture loaded without sRGB sampling without modifying it", async () => {
    const source = await engine.resourceManager.load<Texture2D>({
      url: url("alpha-straight.png"),
      params: { isSRGBColorSpace: false }
    });
    await expect(load("4.2")).rejects.toThrow("requires an sRGB texture");
    expect(source.isSRGBColorSpace).to.equal(false);
    expect(source.destroyed).to.equal(false);
  });
});
