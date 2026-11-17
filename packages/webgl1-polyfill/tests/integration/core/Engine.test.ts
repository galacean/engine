import { HeadlessEngine } from "../../../../rhi-null/dist/module.js";
import {
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  ShaderMacro,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  WebGLEngine
} from "../../../../galacean/dist/module.js";
import { expect, it } from "vitest";
import { createEngine } from "../../helpers/createEngine";

it.each([true, false])(
  "initializes default depth textures with depth texture extension enabled=%s",
  async (withDepthTexture) => {
    const { engine } = await createEngine(withDepthTexture ? [] : ["WEBGL_depth_texture"]);
    try {
      expect(engine._macroCollection.isEnable(ShaderMacro.getByName("ENGINE_NO_DEPTH_TEXTURE"))).toBe(
        !withDepthTexture
      );
      expect(engine._depthTexture2D?.format).toBe(withDepthTexture ? TextureFormat.Depth16 : undefined);
    } finally {
      engine.destroy();
    }
  }
);

it("decodes sRGB texels in the shader when EXT_sRGB is absent", async () => {
  const { engine, gl } = await createEngine(["EXT_sRGB"]);
  try {
    expect(engine._macroCollection.isEnable(ShaderMacro.getByName("ENGINE_NO_SRGB"))).toBe(true);
    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    const renderer = scene.createRootEntity().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new UnlitMaterial(engine);
    renderer.setMaterial(material);
    const sample = (srgb: boolean) => {
      const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, srgb);
      texture.setPixelBuffer(new Uint8Array([128, 128, 128, 255]));
      material.baseTexture = texture;
      camera.render();
      const pixel = new Uint8Array(4);
      gl.readPixels(8, 8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[0];
    };
    const raw = sample(false);
    const decoded = sample(true);
    // Unlit samples both textures with texture2DSRGB. 128/255 decodes to about 55/255.
    expect(Math.abs(raw - 55)).toBeLessThanOrEqual(2);
    expect(Math.abs(decoded - 55)).toBeLessThanOrEqual(2);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("keeps headless and WebGL2 resources intact after installing the fallback", async () => {
  const { engine: fallback, gl } = await createEngine();
  let headless: HeadlessEngine | undefined;
  let native: WebGLEngine | undefined;
  try {
    headless = await HeadlessEngine.create();
    native = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const geometry = [fallback, headless, native].map((engine) => {
      expect(engine.sceneManager.scenes).toHaveLength(1);
      const mesh = PrimitiveMesh.createCuboid(engine, 1, 2, 3, { keepMeshData: true });
      try {
        return {
          positions: mesh.getPositions()!.map((position) => position.toJSON()),
          indices: Array.from(mesh.getIndices()!)
        };
      } finally {
        mesh.destroy();
      }
    });
    expect(geometry[1]).toEqual(geometry[0]);
    expect(geometry[2]).toEqual(geometry[0]);
    expect(fallback._basicResources.whiteTexture2DArray).toBeUndefined();
    expect(headless._basicResources.whiteTexture2DArray).toBeDefined();
    expect(native._basicResources.whiteTexture2DArray).toBeDefined();
    expect(headless._hardwareRenderer.supportsRendering).toBe(false);
    expect(() => headless!.update()).not.toThrow();
    const camera = fallback.sceneManager.activeScene!.createRootEntity().addComponent(Camera);
    camera.render();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    native?.destroy();
    headless?.destroy();
    fallback.destroy();
  }
});
