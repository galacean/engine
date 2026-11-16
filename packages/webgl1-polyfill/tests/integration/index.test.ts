import { Camera, Color, ParticleRenderer, WebGLEngine, WebGLGraphicDevice } from "../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { makeFallbackCanvas, webgl1PolyfillURLPattern } from "../helpers/canvas";

it("loads one compatibility module for concurrent real fallback devices and keeps WebGL2 TF active", async ({
  skip
}) => {
  const nativeCanvas = document.createElement("canvas");
  if (!nativeCanvas.getContext("webgl2")) skip();
  const native = await WebGLEngine.create({ canvas: nativeCanvas });
  const nativeDevice = native._hardwareRenderer as WebGLGraphicDevice;
  const scene = native.sceneManager.activeScene!;
  const nativeParticle = scene.createRootEntity().addComponent(ParticleRenderer).generator;
  nativeParticle.noise.enabled = true;
  const nativeSimulation = nativeParticle._feedbackSimulator;
  const first = makeFallbackCanvas();
  const second = makeFallbackCanvas();
  const engines: WebGLEngine[] = [];

  try {
    expect(nativeDevice.isWebGL2).toBe(true);
    expect(nativeSimulation).not.toBeNull();

    await Promise.all(
      [first, second].map(async ({ canvas }) => {
        const engine = await WebGLEngine.create({ canvas });
        engines.push(engine);
        const device = engine._hardwareRenderer as WebGLGraphicDevice;
        const gl = canvas.getContext("webgl")!;
        expect(device.isWebGL2).toBe(false);
        expect(device.gl).toBe(gl);
        expect(gl.getParameter(gl.VERSION)).toMatch(/^WebGL 1/);

        const root = engine.sceneManager.activeScene!.createRootEntity();
        const camera = root.addComponent(Camera);
        camera.enablePostProcess = false;
        engine.sceneManager.activeScene!.background.solidColor = new Color(1, 0, 0, 1);
        const particle = root.createChild().addComponent(ParticleRenderer).generator;
        particle.noise.enabled = true;
        particle.limitVelocityOverLifetime.enabled = true;
        expect(particle.noise.enabled).toBe(false);
        expect(particle.limitVelocityOverLifetime.enabled).toBe(false);
        expect(particle._feedbackSimulator).toBeNull();
        camera.render();
        const pixel = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        expect(Array.from(pixel)).toEqual([255, 0, 0, 255]);
        expect(gl.getError()).toBe(gl.NO_ERROR);
      })
    );

    expect(
      performance.getEntriesByType("resource").filter((entry) => webgl1PolyfillURLPattern.test(entry.name))
    ).toHaveLength(1);
    nativeParticle._setTransformFeedback();
    expect(nativeParticle._feedbackSimulator).toBe(nativeSimulation);
    expect(nativeParticle.noise.enabled).toBe(true);
    expect(first.attempts.mock.calls.filter(([type]) => type === "webgl2")).toHaveLength(1);
    expect(second.attempts.mock.calls.filter(([type]) => type === "webgl2")).toHaveLength(1);
  } finally {
    engines.forEach((engine) => engine.destroy());
    native.destroy();
  }
});

it("restores the WebGL1 device and redraws without fetching the module again", async () => {
  const { canvas } = makeFallbackCanvas();
  const engine = await WebGLEngine.create({ canvas });
  const gl = canvas.getContext("webgl")!;
  try {
    const scene = engine.sceneManager.activeScene!;
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.enablePostProcess = false;
    scene.background.solidColor = new Color(0, 1, 0, 1);

    const requests = () =>
      performance.getEntriesByType("resource").filter((entry) => webgl1PolyfillURLPattern.test(entry.name)).length;
    const requestCount = requests();
    const extension = gl.getExtension("WEBGL_lose_context")!;
    const lost = new Promise<void>((resolve) => engine.once("devicelost", () => resolve()));
    extension.loseContext();
    await lost;
    expect(gl.isContextLost()).toBe(true);

    const restored = new Promise<void>((resolve) => engine.once("devicerestored", () => resolve()));
    // Chromium rate-limits restoration requests immediately after context loss.
    await new Promise((resolve) => setTimeout(resolve, 100));
    extension.restoreContext();
    await restored;
    expect(engine._hardwareRenderer.gl).toBe(gl);
    camera.render();
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(Array.from(pixel)).toEqual([0, 255, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(requests()).toBe(requestCount);
  } finally {
    engine.destroy();
  }
});
