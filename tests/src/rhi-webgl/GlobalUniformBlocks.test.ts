import {
  BufferBindFlag,
  Camera,
  Material,
  Matrix,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderLanguage,
  ShaderMacro,
  ShaderMacroCollection,
  Texture2D,
  TextureFormat,
  Vector3,
  Vector4,
  WebGLEngine,
  WebGLGraphicDevice
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = `Shader "Tests/GlobalUniformBlocks" {
  SubShader "Default" { Pass "Forward" {
    uniform Scene {
      float scene_ProbeScalars[2];
      vec3 scene_ProbeVectors[2];
      mat3 scene_ProbeBasis;
      mat4 scene_ProbeTransforms[2];
      vec4 scene_ProbeGain;
    };
    uniform Camera { mat4 camera_VPMat; vec4 camera_ProbeColor; };
    mat4 renderer_MVPMat;
    struct Attributes { vec4 POSITION; };
    void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
    void frag() {
      gl_FragColor = vec4(scene_ProbeScalars[1] * scene_ProbeVectors[1].z * scene_ProbeGain.x,
        scene_ProbeBasis[2][1] * scene_ProbeTransforms[1][3][2], camera_ProbeColor.z, 1.0);
    }
    VertexShader = vert;
    FragmentShader = frag;
  }}
}`;

const size = 8;
const sceneBytes = 256;

describe("explicit global uniform blocks on WebGL2", () => {
  let engine: WebGLEngine;
  let shader: Shader;
  let renderer: MeshRenderer;

  function makeCamera(blue: number) {
    const scene = engine.sceneManager.activeScene;
    const camera = scene.createRootEntity("Camera").addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 5);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.shaderData.setVector4("camera_ProbeColor", new Vector4(0, 0, blue, 1));
    const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, size, size, texture);
    return { camera, texture };
  }

  function readPixel(texture: Texture2D, x = size / 2): number[] {
    const rgba = new Uint8Array(4);
    texture.getPixelBuffer(x, size / 2, 1, 1, rgba);
    return Array.from(rgba);
  }

  beforeEach(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    shader = Shader.create(source);
    renderer = engine.sceneManager.activeScene.createRootEntity("Probe").addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    renderer.setMaterial(new Material(engine, shader));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    engine.destroy();
    shader?.destroy(true);
  });

  it("matches linked-driver offsets and strides, and uploads every packed component", () => {
    const gl = engine._hardwareRenderer.gl;
    const serialized = new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES300);
    const block = serialized.subShaders[0].passes[0].uniformBlocks!.find((item) => item.name === "Scene")!;
    const program = shader.subShaders[0].passes[0]._getShaderProgram(engine, new ShaderMacroCollection());
    expect(program.isValid).toBe(true);
    program.bind();
    const native: WebGLProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const index = gl.getUniformBlockIndex(native, block.bindingName ?? block.name);
    expect(index).not.toBe(gl.INVALID_INDEX);
    expect(gl.getActiveUniformBlockParameter(native, index, gl.UNIFORM_BLOCK_DATA_SIZE)).toBe(block.byteLength);
    expect(block.byteLength).toBe(sceneBytes);
    const indices = Array.from<number>(
      gl.getActiveUniformBlockParameter(native, index, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES)
    );
    const offsets = gl.getActiveUniforms(native, indices, gl.UNIFORM_OFFSET);
    const arrayStrides = gl.getActiveUniforms(native, indices, gl.UNIFORM_ARRAY_STRIDE);
    const matrixStrides = gl.getActiveUniforms(native, indices, gl.UNIFORM_MATRIX_STRIDE);
    expect(indices.length).toBe(block.members.length);
    for (let i = 0; i < indices.length; i++) {
      const name = gl
        .getActiveUniform(native, indices[i])!
        .name.split(".")
        .pop()!
        .replace(/\[0\]$/, "");
      expect(block.members.find((member) => member.name === name)).toMatchObject({
        offset: offsets[i],
        arrayStride: arrayStrides[i],
        matrixStride: matrixStrides[i]
      });
    }

    const sceneData = engine.sceneManager.activeScene.shaderData;
    const values = Float32Array.from({ length: 53 }, (_, i) => i + 1);
    sceneData.setFloatArray("scene_ProbeScalars", values.subarray(0, 2));
    sceneData.setFloatArray("scene_ProbeVectors", values.subarray(2, 8));
    sceneData.setFloatArray("scene_ProbeBasis", values.subarray(8, 17));
    sceneData.setFloatArray("scene_ProbeTransforms", values.subarray(17, 49));
    sceneData.setVector4("scene_ProbeGain", new Vector4(50, 51, 52, 53));
    const ranges = vi.spyOn(engine._hardwareRenderer, "bindUniformBufferRange");
    makeCamera(0).camera.render();
    const binding = gl.getActiveUniformBlockParameter(native, index, gl.UNIFORM_BLOCK_BINDING);
    const range = ranges.mock.calls.find(([point, , , length]) => point === binding && length === sceneBytes);
    expect(range).toBeDefined();
    const [, buffer, offset] = range!;
    expect(offset % gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT)).toBe(0);
    const uploaded = new Uint8Array(sceneBytes);
    buffer.getData(uploaded, offset, 0, uploaded.byteLength);

    const expected = new Float32Array(sceneBytes / 4);
    expected[0] = 1;
    expected[4] = 2;
    expected.set([3, 4, 5], 8);
    expected.set([6, 7, 8], 12);
    expected.set([9, 10, 11], 16);
    expected.set([12, 13, 14], 20);
    expected.set([15, 16, 17], 24);
    expected.set(values.subarray(17), 28);
    expect(Array.from(uploaded)).toEqual(Array.from(new Uint8Array(expected.buffer)));
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("preserves both cameras' pixels and the first draw's bytes after in-place scene mutation", () => {
    const sceneData = engine.sceneManager.activeScene.shaderData;
    const gain = new Vector4(1, 0, 0, 0);
    sceneData.setVector4("scene_ProbeGain", gain);
    sceneData.setFloatArray("scene_ProbeScalars", new Float32Array([0, 1]));
    sceneData.setFloatArray("scene_ProbeVectors", new Float32Array([0, 0, 0, 0, 0, 1]));
    const red = makeCamera(0);
    const blue = makeCamera(1);
    const ranges = vi.spyOn(engine._hardwareRenderer, "bindUniformBufferRange");
    red.camera.render();
    const first = ranges.mock.calls.find(([, , , length]) => length === sceneBytes)!;
    expect(first).toBeDefined();
    ranges.mockClear();
    gain.x = 0;
    blue.camera.render();
    const second = ranges.mock.calls.find(([, , , length]) => length === sceneBytes)!;
    expect(second).toBeDefined();
    expect(first[1] !== second[1] || first[2] !== second[2]).toBe(true);
    const retained = new Float32Array(1);
    first[1].getData(retained, first[2] + 240, 0, 1);
    expect(retained[0]).toBe(1);
    expect(readPixel(red.texture)).toEqual([255, 0, 0, 255]);
    expect(readPixel(blue.texture)).toEqual([0, 0, 255, 255]);
    expect(engine._hardwareRenderer.gl.getError()).toBe(engine._hardwareRenderer.gl.NO_ERROR);
  });

  it("preserves material and renderer overrides for migrated built-ins while custom block values use their owner", () => {
    const probe = Shader.create(`Shader "Tests/GlobalOverrides" { SubShader "s" { Pass "p" {
      #include "ShaderLibrary/Common/Transform.glsl"
      uniform Scene { float scene_StrictTint; };
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
      void frag() { gl_FragColor = vec4(camera_Position.xy, scene_StrictTint, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
    try {
      const material = new Material(engine, probe);
      renderer.setMaterial(material);
      const scene = engine.sceneManager.activeScene;
      const { camera, texture } = makeCamera(0);
      scene.shaderData.setFloat("scene_StrictTint", 1);
      material.shaderData.setFloat("scene_StrictTint", 0);
      camera.render();
      expect(readPixel(texture)).toEqual([0, 0, 255, 255]);

      material.shaderData.setVector3("camera_Position", new Vector3(1, 0, 0));
      camera.render();
      expect(readPixel(texture)).toEqual([255, 0, 255, 255]);
      renderer.shaderData.setVector3("camera_Position", new Vector3(0, 1, 0));
      renderer.shaderData.setFloat("scene_StrictTint", 0);
      camera.render();
      expect(readPixel(texture)).toEqual([0, 255, 255, 255]);
    } finally {
      probe.destroy(true);
    }
  });

  it("links a fragment-only Camera block into the derived instanced vertex transform", () => {
    const second = engine.sceneManager.activeScene.createRootEntity("SecondInstance").addComponent(MeshRenderer);
    second.mesh = renderer.mesh;
    second.setMaterial(renderer.getMaterial());
    renderer.entity.transform.setPosition(-0.55, 0, 0);
    second.entity.transform.setPosition(0.55, 0, 0);
    renderer.entity.transform.setScale(0.6, 1, 1);
    second.entity.transform.setScale(0.6, 1, 1);
    const { camera, texture } = makeCamera(1);
    const gl = engine._hardwareRenderer.gl;
    const draws = vi.spyOn(gl, "drawElementsInstanced");
    camera.render();
    expect(draws.mock.calls.some((args) => args[4] === 2)).toBe(true);
    expect(readPixel(texture, 2)).toEqual([0, 0, 255, 255]);
    expect(readPixel(texture, 6)).toEqual([0, 0, 255, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it.each(["Scene", "Camera"])("links a helper before its instanced matrix dependency in %s", (owner) => {
    const probe = Shader.create(`Shader "Tests/ForwardInstance${owner}" { SubShader "s" { Pass "p" {
      mat4 renderer_MVPMat;
      vec4 project(vec4 p) { return renderer_MVPMat * p; }
      uniform ${owner} { mat4 camera_VPMat; float probeGain; };
      void vert() { gl_Position = project(vec4(probeGain)); }
      void frag() { gl_FragColor = vec4(probeGain); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
    try {
      const macros = new ShaderMacroCollection();
      const pass = probe.subShaders[0].passes[0];
      expect(pass._getShaderProgram(engine, macros).isValid).toBe(true);
      macros.enable(ShaderMacro.getByName("RENDERER_GPU_INSTANCE"));
      const instanced = pass._getShaderProgram(engine, macros);
      expect(instanced.isValid).toBe(true);
      instanced.bind();
      const gl = engine._hardwareRenderer.gl;
      const native: WebGLProgram = gl.getParameter(gl.CURRENT_PROGRAM);
      const layout = pass["_uniformBlocks"]!.find((block) => block.name === owner)!;
      expect(gl.getUniformBlockIndex(native, layout.bindingName ?? layout.name)).not.toBe(gl.INVALID_INDEX);
      expect(gl.getUniformLocation(native, "camera_VPMat")).toBeNull();
    } finally {
      probe.destroy(true);
    }
  });

  it("keeps explicit renderer-named Scene members while transforming each instance separately", () => {
    const probe = Shader.create(`Shader "Tests/ExplicitInstanceNames" { SubShader "s" { Pass "p" {
      uniform Scene { mat4 renderer_ModelMat; mat4 renderer_NormalMat; };
      mat4 renderer_MVPMat;
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
      void frag() { gl_FragColor = vec4(renderer_ModelMat[3].x, 0.0, renderer_NormalMat[3].y, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
    const material = new Material(engine, probe);
    try {
      const scene = engine.sceneManager.activeScene;
      const value = new Matrix();
      value.elements[12] = value.elements[13] = 1;
      scene.shaderData.setMatrix("renderer_ModelMat", value);
      scene.shaderData.setMatrix("renderer_NormalMat", value);
      renderer.setMaterial(material);
      renderer.entity.transform.setPosition(-0.55, 0, 0);
      renderer.entity.transform.setScale(0.6, 1, 1);
      const { camera, texture } = makeCamera(0);
      camera.render();
      expect(readPixel(texture, 2)).toEqual([255, 0, 255, 255]);
      const second = scene.createRootEntity("Second").addComponent(MeshRenderer);
      second.mesh = renderer.mesh;
      second.setMaterial(material);
      second.entity.transform.setPosition(0.55, 0, 0);
      second.entity.transform.setScale(0.6, 1, 1);
      const draws = vi.spyOn(engine._hardwareRenderer.gl, "drawElementsInstanced");
      camera.render();
      expect(draws.mock.calls.some((args) => args[4] === 2)).toBe(true);
      expect(readPixel(texture, 2)).toEqual([255, 0, 255, 255]);
      expect(readPixel(texture, 6)).toEqual([255, 0, 255, 255]);
    } finally {
      material.destroy(true);
      probe.destroy(true);
    }
  });

  it("reuses an indexed range until the binding or device state changes", () => {
    const device = engine._hardwareRenderer;
    const gl = device.gl;
    const alignment = device.uniformBufferOffsetAlignment;
    const buffer = device.createPlatformBuffer(BufferBindFlag.ConstantBuffer, alignment + 16);
    const calls = vi.spyOn(gl, "bindBufferRange");
    try {
      device.bindUniformBufferRange(1, buffer, 0, 16);
      device.bindUniformBufferRange(1, buffer, 0, 16);
      expect(calls).toHaveBeenCalledTimes(1);
      device.bindUniformBufferRange(1, buffer, alignment, 16);
      expect(gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, 1)).toBe(alignment);
      device.bindUniformBufferBase(1, buffer);
      device.bindUniformBufferRange(1, buffer, alignment, 16);
      expect(gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, 1)).toBe(alignment);
      device.resetState();
      device.bindUniformBufferRange(1, buffer, alignment, 16);
      expect(calls).toHaveBeenCalledTimes(4);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      buffer.destroy();
    }
  });

  it("tracks indexed bindings across devices that share a WebGL context", () => {
    const device = engine._hardwareRenderer;
    const gl = device.gl;
    const buffer = device.createPlatformBuffer(BufferBindFlag.ConstantBuffer, 16);
    const otherBuffer = device.createPlatformBuffer(BufferBindFlag.ConstantBuffer, 16);
    const ignoreContextEvent = () => {};
    let peer = new WebGLGraphicDevice();
    peer.init(engine.canvas, ignoreContextEvent, ignoreContextEvent);
    try {
      const bound = () => gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, 1);
      device.bindUniformBufferRange(1, buffer, 0, 16);
      const first = bound();
      peer.bindUniformBufferRange(1, otherBuffer, 0, 16);
      const second = bound();
      expect(first).not.toBe(second);
      device.bindUniformBufferRange(1, buffer, 0, 16);
      expect(bound()).toBe(first);
      peer.bindUniformBufferBase(1, otherBuffer);
      device.bindUniformBufferRange(1, buffer, 0, 16);
      expect(bound()).toBe(first);

      gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, second);
      peer.resetState();
      device.bindUniformBufferRange(1, buffer, 0, 16);
      expect(bound()).toBe(first);

      peer.destroy();
      peer = new WebGLGraphicDevice();
      peer.init(engine.canvas, ignoreContextEvent, ignoreContextEvent);
      peer.bindUniformBufferRange(1, otherBuffer, 0, 16);
      device.bindUniformBufferRange(1, buffer, 0, 16);
      expect(bound()).toBe(first);
      peer.bindUniformBufferRange(1, otherBuffer, 0, 16);
      expect(bound()).toBe(second);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      peer.destroy();
      otherBuffer.destroy();
      buffer.destroy();
    }
  });

  it("uploads through the indexed bind after raw GL changes the generic uniform binding", () => {
    const device = engine._hardwareRenderer;
    const gl = device.gl;
    const first = device.createPlatformBuffer(BufferBindFlag.ConstantBuffer, 16);
    const second = device.createPlatformBuffer(BufferBindFlag.ConstantBuffer, 16);
    try {
      const values = new Uint32Array([1, 2, 3, 4]);
      device.bindUniformBufferRange(1, first, 0, 16, values);
      device.bindUniformBufferRange(2, second, 0, 16, values);
      const invalid = new Uint32Array([99, 99, 99, 99]);
      expect(() => device.bindUniformBufferRange(1, first, device.uniformBufferOffsetAlignment, 16, invalid)).toThrow(
        RangeError
      );
      expect(() => device.bindUniformBufferRange(1, first, 0, 8, invalid)).toThrow(RangeError);
      gl.bindBuffer(gl.UNIFORM_BUFFER, null);
      const binds = vi.spyOn(gl, "bindBuffer");
      const ranges = vi.spyOn(gl, "bindBufferRange");
      values[0] = 9;
      device.bindUniformBufferRange(1, first, 0, 16, values, true);
      device.bindUniformBufferRange(1, first, 0, 16);
      expect(ranges).toHaveBeenCalledOnce();
      expect(binds).not.toHaveBeenCalled();
      const stored = new Uint32Array(4);
      first.getData(stored);
      expect(Array.from(stored)).toEqual([9, 2, 3, 4]);
      second.getData(stored);
      expect(Array.from(stored)).toEqual([1, 2, 3, 4]);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    } finally {
      first.destroy();
      second.destroy();
    }
  });

  it("reports invalid ranges on every call and preserves the previously bound range", () => {
    const device = engine._hardwareRenderer;
    const gl = device.gl;
    const buffer = device.createPlatformBuffer(BufferBindFlag.ConstantBuffer, 32);
    try {
      device.bindUniformBufferRange(1, buffer, 0, 16);
      const invalidRanges = [[0, 0]];
      if (device.uniformBufferOffsetAlignment > 1) invalidRanges.push([1, 16]);
      for (const [offset, size] of invalidRanges) {
        for (let retry = 0; retry < 2; retry++) {
          device.bindUniformBufferRange(1, buffer, offset, size);
          expect(gl.getError()).toBe(gl.INVALID_VALUE);
          expect(gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, 1)).toBe(0);
          expect(gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, 1)).toBe(16);
        }
      }
    } finally {
      buffer.destroy();
    }
  });
});
