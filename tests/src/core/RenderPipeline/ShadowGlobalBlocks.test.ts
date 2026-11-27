import {
  Camera,
  DirectLight,
  MeshRenderer,
  PrimitiveMesh,
  ShadowCascadesMode,
  ShadowResolution,
  ShadowType,
  UnlitMaterial,
  WebGLEngine
} from "@galacean/engine";
import { expect, it, vi } from "vitest";

/** Read the uniform range the current draw actually sees, using the driver's member offset. */
function readMember(gl: WebGL2RenderingContext, member: string, length: number): Float32Array {
  const program = gl.getParameter(gl.CURRENT_PROGRAM);
  const [field] = gl.getUniformIndices(program, [member])!;
  expect(field).not.toBe(gl.INVALID_INDEX);
  const [index] = gl.getActiveUniforms(program, [field], gl.UNIFORM_BLOCK_INDEX);
  const binding = gl.getActiveUniformBlockParameter(program, index, gl.UNIFORM_BLOCK_BINDING);
  const [offset] = gl.getActiveUniforms(program, [field], gl.UNIFORM_OFFSET);
  const start = gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, binding);
  const buffer = gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, binding);
  const previous = gl.getParameter(gl.COPY_READ_BUFFER_BINDING);
  gl.bindBuffer(gl.COPY_READ_BUFFER, buffer);
  const result = new Float32Array(length);
  gl.getBufferSubData(gl.COPY_READ_BUFFER, start + offset, result);
  gl.bindBuffer(gl.COPY_READ_BUFFER, previous);
  return result;
}

it("binds each shadow cascade's scene bias and camera matrix for both cameras in one update", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const engine = await WebGLEngine.create({ canvas });
  try {
    const scene = engine.sceneManager.activeScene;
    scene.shadowCascades = ShadowCascadesMode.FourCascades;
    scene.shadowResolution = ShadowResolution.Low;
    const root = scene.createRootEntity();
    const light = root.createChild().addComponent(DirectLight);
    light.entity.transform.setRotation(-45, 30, 0);
    light.shadowType = ShadowType.Hard;
    const renderer = root.createChild().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 120, 120, 120);
    renderer.setMaterial(new UnlitMaterial(engine));

    const cameras = [root.createChild().addComponent(Camera), root.createChild().addComponent(Camera)];
    cameras[1].entity.transform.setPosition(4, 0, 0);
    const matrices: number[][][] = [[], []];
    const biases: number[][] = [[], []];
    const device = engine._hardwareRenderer;
    const gl = canvas.getContext("webgl2")!;
    const draw = device.drawPrimitive.bind(device);
    vi.spyOn(device, "drawPrimitive").mockImplementation((...args) => {
      const { camera, virtualCamera } = engine._renderContext;
      if (virtualCamera !== camera._virtualCamera) {
        const matrix = readMember(gl, "camera_VPMat", 16);
        const bias = readMember(gl, "scene_ShadowBias", 2);
        const expectedBias = scene.shaderData.getVector2("scene_ShadowBias");
        expect(matrix).toEqual(camera.shaderData.getMatrix("camera_VPMat").elements);
        expect(bias).toEqual(new Float32Array([expectedBias.x, expectedBias.y]));
        const i = cameras.indexOf(camera);
        matrices[i].push(Array.from(matrix));
        biases[i].push(bias[0]);
      }
      draw(...args);
    });

    engine.update();
    for (let i = 0; i < cameras.length; i++) {
      expect(new Set(biases[i]).size).toBe(4);
      expect(matrices[i]).toHaveLength(4);
    }
    expect(matrices[0][0]).not.toEqual(matrices[1][0]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  } finally {
    engine.destroy();
  }
});
