import {
  Camera,
  Material,
  Matrix,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderFactory,
  ShaderLanguage,
  Texture2D,
  TextureFormat,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const source = `Shader "Tests/CompiledInstancing" { SubShader "Default" { Pass "Forward" {
  mat4 renderer_MVPMat;
  vec4 instanceProbeTint;
  struct Attributes { vec4 POSITION; };
  vec4 echo(vec4 instanceProbeTint) { return instanceProbeTint; }
  void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
  void frag() { gl_FragColor = echo(instanceProbeTint); }
  VertexShader = vert;
  FragmentShader = frag;
} } }`;

describe("compiler-driven instancing on WebGL2", () => {
  let engine: WebGLEngine;
  let shader: Shader;

  beforeEach(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    engine.destroy();
    shader?.destroy(true);
  });

  function setup(count: number) {
    const scene = engine.sceneManager.activeScene;
    const width = 8 * count;
    const height = 16;
    const camera = scene.createRootEntity("Camera").addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 5);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    const texture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, width, height, texture);
    const mesh = PrimitiveMesh.createCuboid(engine, 0.65, 0.65, 0.65);
    const material = new Material(engine, shader);
    const renderers = Array.from({ length: count }, (_, i) => {
      const renderer = scene.createRootEntity("Probe" + i).addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      renderer.entity.transform.setPosition(i - (count - 1) / 2, 0, 0);
      return renderer;
    });
    function pixel(index: number): number[] {
      const rgba = new Uint8Array(4);
      texture.getPixelBuffer(index * 8 + 4, height / 2, 1, 1, rgba);
      return Array.from(rgba);
    }
    return { camera, material, renderers, pixel };
  }

  it.each([".shader", ".shaderc"])("applies late renderer overrides in a single %s instanced draw", (format) => {
    const injection = vi.spyOn(ShaderFactory, "injectInstanceUBO");
    if (format === ".shader") {
      shader = Shader.create(source);
    } else {
      const asset = new ShaderPrecompiler().precompile(source, ShaderLanguage.GLSLES300);
      shader = Shader._createFromPrecompiled(JSON.parse(JSON.stringify(asset)));
    }
    const { camera, material, renderers, pixel } = setup(2);
    material.shaderData.setVector4("instanceProbeTint", new Vector4(1, 0, 0, 1));
    const gl = engine._hardwareRenderer.gl;
    const draws = vi.spyOn(gl, "drawElementsInstanced");
    camera.render();
    expect(pixel(0)).toEqual([255, 0, 0, 255]);
    expect(pixel(1)).toEqual([255, 0, 0, 255]);
    renderers[1].shaderData.setVector4("instanceProbeTint", new Vector4(0, 0, 1, 1));
    draws.mockClear();
    camera.render();
    expect(draws.mock.calls.map((call) => call[4])).toEqual([2]);
    expect(pixel(0)).toEqual([255, 0, 0, 255]);
    expect(pixel(1)).toEqual([0, 0, 255, 255]);
    expect(injection).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("retains every pixel when a third segment wraps the two aligned instance ranges in one frame", () => {
    shader = Shader.create(source);
    const device = engine._hardwareRenderer;
    device.maxUniformBlockSize = 192;
    const { camera, renderers, pixel } = setup(5);
    const colors = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, 0, 1]
    ];
    for (let i = 0; i < renderers.length; i++) {
      const [r, g, b] = colors[i];
      renderers[i].shaderData.setVector4("instanceProbeTint", new Vector4(r, g, b, 1));
    }
    const draws = vi.spyOn(device.gl, "drawElementsInstanced");
    const ranges = vi.spyOn(device, "bindUniformBufferRange");
    camera.render();
    expect(draws.mock.calls.map((call) => call[4])).toEqual([2, 2, 1]);
    const alignment = device.uniformBufferOffsetAlignment;
    const instanceRanges = ranges.mock.calls.filter(([point]) => point === 0);
    expect(instanceRanges.map(([, , offset, bytes]) => [offset, bytes])).toEqual([
      [0, 192],
      [Math.ceil(192 / alignment) * alignment, 192],
      [0, 192]
    ]);
    for (let i = 0; i < colors.length; i++) {
      expect(pixel(i)).toEqual([...colors[i].map((channel) => channel * 255), 255]);
    }
    expect(device.gl.getError()).toBe(device.gl.NO_ERROR);
  });

  it.each(["Scene", "Camera", "loose"])("uses the selected %s matrix for derived instance transforms", (owner) => {
    const declaration = owner === "loose" ? "mat4 camera_VPMat;" : `uniform ${owner} { mat4 camera_VPMat; };`;
    shader = Shader.create(
      source
        .replace("vec4 instanceProbeTint;", `${declaration}\nvec4 instanceProbeTint;`)
        .replace("echo(instanceProbeTint);", "echo(instanceProbeTint) * abs(camera_VPMat[0][0]);")
    );
    const { camera, material, renderers, pixel } = setup(2);
    renderers[0].shaderData.setVector4("instanceProbeTint", new Vector4(1, 0, 0, 1));
    renderers[1].shaderData.setVector4("instanceProbeTint", new Vector4(0, 0, 1, 1));
    const mirror = new Matrix();
    mirror.elements[0] = -1;
    if (owner === "Scene") {
      engine.sceneManager.activeScene.shaderData.setMatrix("camera_VPMat", mirror);
      material.shaderData.setMatrix("camera_VPMat", new Matrix());
    } else {
      material.shaderData.setMatrix("camera_VPMat", mirror);
    }
    const gl = engine._hardwareRenderer.gl;
    const draws = vi.spyOn(gl, "drawElementsInstanced");
    camera.render();
    expect(draws.mock.calls.map((call) => call[4])).toEqual([2]);
    expect(pixel(0)).toEqual([0, 0, 255, 255]);
    expect(pixel(1)).toEqual([255, 0, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("draws historical .shaderc instructions without declaration metadata", () => {
    shader = Shader._createFromPrecompiled({
      name: "Tests/HistoricalInstanceInstructions",
      platformTarget: ShaderLanguage.GLSLES300,
      subShaders: [
        {
          name: "Default",
          passes: [
            {
              name: "Forward",
              isUsePass: false,
              renderStates: { constantMap: {}, variableMap: {} },
              vertexShaderInstructions: [
                [
                  0,
                  "in vec3 POSITION;\nuniform mat4 renderer_MVPMat;\nvoid main() { gl_Position = renderer_MVPMat * vec4(POSITION, 1.0); }"
                ]
              ],
              fragmentShaderInstructions: [
                [0, "out vec4 color;\nuniform vec4 legacyInstanceColor;\nvoid main() { color = legacyInstanceColor; }"]
              ]
            }
          ]
        }
      ]
    });
    const { camera, renderers, pixel } = setup(2);
    renderers[0].shaderData.setVector4("legacyInstanceColor", new Vector4(1, 0, 1, 1));
    renderers[1].shaderData.setVector4("legacyInstanceColor", new Vector4(0, 1, 1, 1));
    const gl = engine._hardwareRenderer.gl;
    const draws = vi.spyOn(gl, "drawElementsInstanced");
    camera.render();
    expect(draws.mock.calls.map((call) => call[4])).toEqual([2]);
    expect(pixel(0)).toEqual([255, 0, 255, 255]);
    expect(pixel(1)).toEqual([0, 255, 255, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("separates renderer overrides of the camera matrix before uploading each instance batch", () => {
    shader = Shader.create(source);
    const { camera, renderers, pixel } = setup(4);
    const left = new Matrix();
    left.elements[0] = 0.5;
    const right = new Matrix();
    right.elements[0] = -0.5;
    right.elements[12] = 1;
    const colors = [new Vector4(1, 0, 0, 1), new Vector4(0, 1, 0, 1), new Vector4(0, 0, 1, 1), new Vector4(1, 1, 0, 1)];
    for (let i = 0; i < renderers.length; i++) {
      const renderer = renderers[i];
      renderer.priority = i;
      renderer.shaderData.setMatrix("camera_VPMat", i < 2 ? left : right);
      renderer.shaderData.setVector4("instanceProbeTint", colors[i]);
    }
    const gl = engine._hardwareRenderer.gl;
    const draws = vi.spyOn(gl, "drawElementsInstanced");
    camera.render();
    expect(draws.mock.calls.map((call) => call[4])).toEqual([2, 2]);
    expect([pixel(0), pixel(1), pixel(2), pixel(3)]).toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [255, 255, 0, 255],
      [0, 0, 255, 255]
    ]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("draws each transform with its own properties when one instance exceeds the block limit", () => {
    shader = Shader.create(source);
    const device = engine._hardwareRenderer;
    device.maxUniformBlockSize = 96;
    const { camera, renderers, pixel } = setup(2);
    renderers[0].shaderData.setVector4("instanceProbeTint", new Vector4(0, 1, 0, 1));
    renderers[1].shaderData.setVector4("instanceProbeTint", new Vector4(1, 0, 0, 1));
    const instanced = vi.spyOn(device.gl, "drawElementsInstanced");
    const ordinary = vi.spyOn(device.gl, "drawElements");
    camera.render();
    expect(instanced).not.toHaveBeenCalled();
    expect(ordinary).toHaveBeenCalledTimes(2);
    expect(pixel(0)).toEqual([0, 255, 0, 255]);
    expect(pixel(1)).toEqual([255, 0, 0, 255]);
    expect(device.gl.getError()).toBe(device.gl.NO_ERROR);
  });

  it.each(["historical", "compiled"])(
    "keeps a helper's local precision out of subsequent %s shared uniforms",
    (mode) => {
      const text = `Shader "Tests/FunctionLocalPrecision" { SubShader "Default" { Pass "Forward" {
      float vertexGain(float v) { precision mediump float; return v; }
      float sharedStageGain;
      mat4 renderer_MVPMat;
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION * vertexGain(sharedStageGain); }
      void frag() { gl_FragColor = vec4(sharedStageGain, 0.0, 0.0, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`;
      const asset = new ShaderPrecompiler().precompile(text);
      if (mode === "historical") delete asset.subShaders[0].passes[0].uniformPlan;
      shader = Shader._createFromPrecompiled(asset);
      const { camera, material, pixel } = setup(2);
      material.shaderData.setFloat("sharedStageGain", 1);
      const gl = engine._hardwareRenderer.gl;
      const draws = vi.spyOn(gl, "drawElementsInstanced");
      camera.render();
      expect(draws.mock.calls.map((call) => call[4])).toEqual([2]);
      expect(pixel(0)).toEqual([255, 0, 0, 255]);
      expect(pixel(1)).toEqual([255, 0, 0, 255]);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    }
  );

  it.each(["historical", "compiled"])("retains each entity's world matrix in the %s instance record", (mode) => {
    const text = `Shader "Tests/ModelMatrixOwner" { SubShader "Default" { Pass "Forward" {
      mat4 renderer_ModelMat;
      mat4 camera_VPMat;
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = camera_VPMat * renderer_ModelMat * a.POSITION; }
      void frag() { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`;
    const asset = new ShaderPrecompiler().precompile(text);
    if (mode === "historical") delete asset.subShaders[0].passes[0].uniformPlan;
    shader = Shader._createFromPrecompiled(asset);
    const { camera, material, pixel } = setup(2);
    const offscreen = new Matrix();
    offscreen.elements[12] = 5;
    material.shaderData.setMatrix("renderer_ModelMat", offscreen);
    const elementData = new ShaderData(ShaderDataGroup.RenderElement);
    elementData.setMatrix("renderer_ModelMat", offscreen);
    const pipeline = camera._renderPipeline;
    const push = pipeline.pushRenderElement.bind(pipeline);
    vi.spyOn(pipeline, "pushRenderElement").mockImplementation((context, element) => {
      element.shaderData = elementData;
      push(context, element);
    });
    const gl = engine._hardwareRenderer.gl;
    const draws = vi.spyOn(gl, "drawElementsInstanced");
    camera.render();
    expect(draws.mock.calls.map((call) => call[4])).toEqual([2]);
    expect(pixel(0)).toEqual([255, 0, 0, 255]);
    expect(pixel(1)).toEqual([255, 0, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });
});
