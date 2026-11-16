import {
  Camera,
  Color,
  MeshRenderer,
  PrimitiveMesh,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "../../../../galacean/dist/module.js";
import { expect, it, vi } from "vitest";
import { makeFallbackCanvas } from "../../helpers/canvas";
import { createEngine } from "../../helpers/createEngine";

it("draws without instancing and cleans up cached VAOs", async () => {
  const { engine, gl } = await createEngine(["ANGLE_instanced_arrays"]);
  try {
    const scene = engine.sceneManager.activeScene!;
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new UnlitMaterial(engine);
    material.baseColor = new Color(1, 0, 0, 1);
    for (const x of [-0.5, 0.5]) {
      const entity = scene.createRootEntity();
      entity.transform.position = new Vector3(x, 0, 0);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
    }
    const draw = vi.spyOn(gl, "drawElements");
    const bindAttribute = vi.spyOn(gl, "vertexAttribPointer");
    const rhiPrimitive = (mesh._primitive as any)._platformPrimitive;
    const clearVAO = vi.spyOn(rhiPrimitive, "_clearVAO");
    scene.background.solidColor = new Color(0, 1, 0, 1);
    camera.render();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(bindAttribute).toHaveBeenCalled();
    expect(rhiPrimitive._vaoMap.size).toBeGreaterThan(0);
    clearVAO.mockClear();
    rhiPrimitive.destroy();
    expect(clearVAO).toHaveBeenCalledOnce();
    expect(rhiPrimitive._vaoMap.size).toBe(0);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});

it("renders on real WebGL1 without optional VAO, instancing, depth, sRGB or float extensions", async () => {
  const { canvas } = makeFallbackCanvas();
  canvas.width = canvas.height = 32;
  const gl = canvas.getContext("webgl")!;
  const getExtension = gl.getExtension.bind(gl);
  const disabled = new Set([
    "OES_vertex_array_object",
    "ANGLE_instanced_arrays",
    "WEBGL_depth_texture",
    "EXT_sRGB",
    "WEBGL_draw_buffers",
    "EXT_blend_minmax",
    "OES_element_index_uint",
    "OES_texture_float",
    "OES_texture_half_float"
  ]);
  vi.spyOn(gl, "getExtension").mockImplementation((name) => (disabled.has(name) ? null : getExtension(name)));
  const engine = await WebGLEngine.create({ canvas });
  try {
    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0, 1, 0, 1);
    const cameraEntity = scene.createRootEntity();
    cameraEntity.transform.setPosition(0, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    camera.enablePostProcess = false;
    const renderer = scene.createRootEntity().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new UnlitMaterial(engine);
    material.baseColor = new Color(1, 0, 0, 1);
    renderer.setMaterial(material);
    camera.render();
    const pixel = new Uint8Array(4);
    gl.readPixels(16, 16, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(Array.from(pixel)).toEqual([255, 0, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
    expect(engine._hardwareRenderer.capability.maxDrawBuffers).toBe(1);
    expect(engine._hardwareRenderer.capability.maxAntiAliasing).toBe(1);
    const rhiPrimitive = (renderer.mesh!._primitive as any)._platformPrimitive;
    const clearVAO = vi.spyOn(rhiPrimitive, "_clearVAO");
    rhiPrimitive.destroy();
    expect(clearVAO).not.toHaveBeenCalled();
  } finally {
    engine.destroy();
  }
});
