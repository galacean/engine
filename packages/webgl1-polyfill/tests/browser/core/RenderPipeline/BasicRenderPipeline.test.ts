import {
  Camera,
  CameraClearFlags,
  Color,
  GLCapabilityType,
  RenderTarget,
  Texture2D,
  TextureFormat,
  WebGLEngine
} from "../../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { createEngine } from "../../../helpers/createEngine";
import { createWebGL1Canvas } from "../../../helpers/canvas";

it("uses Depth16 for an internal depth-only target and still rejects explicitly requested Depth24", async () => {
  const canvas = createWebGL1Canvas();
  const engine = await WebGLEngine.create({ canvas, graphicDeviceOptions: { depth: true, stencil: false } });
  try {
    const gl = canvas.getContext("webgl")!;
    const storage = vi.spyOn(gl, "renderbufferStorage");
    const camera = engine.sceneManager.activeScene!.createRootEntity().addComponent(Camera);
    camera.render();
    expect(storage).toHaveBeenCalledWith(
      gl.RENDERBUFFER,
      gl.DEPTH_COMPONENT16,
      camera.pixelViewport.width,
      camera.pixelViewport.height
    );
    expect(gl.getError()).toBe(gl.NO_ERROR);
    const color = new Texture2D(engine, 4, 4);
    expect(() => new RenderTarget(engine, 4, 4, color, TextureFormat.Depth24)).toThrow("Depth24");
  } finally {
    engine.destroy();
  }
});

it("renders without framebuffer blit", async () => {
  const { engine, gl } = await createEngine();
  try {
    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    scene.background.solidColor = new Color(0, 1, 0, 1);
    camera.render();
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect([...pixel]).toEqual([0, 255, 0, 255]);
    expect(camera._renderPipeline["_needsBackgroundColorCopy"](1, false)).toBe(true);
    camera.clearFlags = CameraClearFlags.DepthStencil;
    const copy = vi.spyOn(engine._hardwareRenderer, "copyRenderTargetToSubTexture");
    camera.render();
    expect(copy).toHaveBeenCalled();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect([...pixel]).toEqual([0, 255, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("does not create the ambient occlusion pass or enable its shader variant without fragment highp", async () => {
  const canvas = createWebGL1Canvas();
  const gl = canvas.getContext("webgl")!;
  const precision = vi
    .spyOn(gl, "getShaderPrecisionFormat")
    .mockReturnValue({ precision: 0, rangeMin: 0, rangeMax: 0 });
  let engine: WebGLEngine | undefined;
  try {
    engine = await WebGLEngine.create({ canvas });
    expect(engine._hardwareRenderer.canIUse(GLCapabilityType.fragmentHighPrecision)).toBe(false);
    const scene = engine.sceneManager.activeScene!;
    const camera = scene.createRootEntity().addComponent(Camera);
    expect(camera._renderPipeline["_saoPass"]).toBeNull();
    scene.ambientOcclusion.enabled = true;
    expect(scene.shaderData.getMacros().map(({ name }) => name)).not.toContain("SCENE_ENABLE_AMBIENT_OCCLUSION");
    camera.render();
    camera.render();
    expect(precision).toHaveBeenCalledExactlyOnceWith(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    expect(camera._renderPipeline["_depthOnlyPass"]?.renderTarget).toBeFalsy();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    precision.mockRestore();
    engine?.destroy();
  }
});
