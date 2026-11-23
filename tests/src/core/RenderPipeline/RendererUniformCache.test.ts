import {
  Camera,
  Color,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderMacroCollection,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let engine: WebGLEngine;
let shader: Shader;

beforeEach(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), shaderCompiler: new ShaderCompiler() });
});

afterEach(() => {
  vi.restoreAllMocks();
  shader?.destroy(true);
  engine.destroy();
});

it("reuses stable renderer ranges across frames and draws changed matrix, tint and camera values immediately", () => {
  shader = Shader.create(`Shader "Test/StableRendererRanges" { SubShader "s" { Pass "p" {
    mat4 renderer_MVPMat;
    vec4 stableRendererTint;
    vec4 stableCameraFilter;
    struct Attributes { vec4 POSITION; };
    void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
    void frag() { gl_FragColor = stableRendererTint * stableCameraFilter; }
    VertexShader = vert; FragmentShader = frag;
  } } }`);
  const root = engine.sceneManager.activeScene.createRootEntity();
  const camera = root.createChild().addComponent(Camera);
  camera.entity.transform.setPosition(0, 0, 5);
  camera.isOrthographic = true;
  camera.orthographicSize = 1;
  const filter = new Vector4(1, 1, 1, 1);
  engine.sceneManager.activeScene.shaderData.setVector4("stableCameraFilter", new Vector4(0, 0, 0, 1));
  camera.shaderData.setVector4("stableCameraFilter", filter);
  const target = new Texture2D(engine, 8, 8, TextureFormat.R8G8B8A8_UNorm, false, false);
  camera.renderTarget = new RenderTarget(engine, 8, 8, target);
  const mesh = PrimitiveMesh.createCuboid(engine, 0.65, 1, 1);
  const colors = [new Vector4(1, 0, 0, 1), new Vector4(0, 0, 1, 1)];
  const renderers = colors.map((color, i) => {
    const entity = root.createChild();
    entity.transform.setPosition(i - 0.5, 0, 0);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(new Material(engine, shader));
    renderer.shaderData.setVector4("stableRendererTint", color);
    return renderer;
  });
  const gl = engine._hardwareRenderer.gl;
  const uploads = vi.spyOn(gl, "bufferSubData");
  function frame(): number {
    uploads.mockClear();
    engine.update();
    return uploads.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER).length;
  }
  function pixel(x: number): number[] {
    const value = new Uint8Array(4);
    target.getPixelBuffer(x, 4, 1, 1, value);
    return Array.from(value);
  }
  expect(frame()).toBeGreaterThan(0);
  expect(frame()).toBeGreaterThan(0);
  expect(frame()).toBe(0);
  expect(pixel(2)).toEqual([255, 0, 0, 255]);
  expect(pixel(6)).toEqual([0, 0, 255, 255]);

  colors[0].set(0, 1, 0, 1);
  renderers[0].entity.transform.setPosition(-0.5, 3, 0);
  camera.render();
  expect(pixel(2)).not.toEqual([255, 0, 0, 255]);
  renderers[0].entity.transform.setPosition(-0.5, 0, 0);
  filter.y = 0.5;
  camera.render();
  expect(pixel(2)).toEqual([0, 128, 0, 255]);
  expect(pixel(6)).toEqual([0, 0, 255, 255]);
  frame();
  expect(frame()).toBe(0);
  engine.resourceManager._lostGraphicResources();
  expect(frame()).toBeGreaterThan(0);
  expect(pixel(2)).toEqual([0, 128, 0, 255]);
  expect(pixel(6)).toEqual([0, 0, 255, 255]);
  expect(frame()).toBe(0);
  expect(gl.getError()).toBe(gl.NO_ERROR);
});

it("reuses the built-in unlit layout with transforms and alternating materials", () => {
  const root = engine.sceneManager.activeScene.createRootEntity();
  const camera = root.createChild().addComponent(Camera);
  camera.entity.transform.setPosition(0, 0, 5);
  camera.isOrthographic = true;
  camera.orthographicSize = 1;
  const mesh = PrimitiveMesh.createCuboid(engine, 0.08, 0.3, 0.1);
  const materials = Array.from({ length: 8 }, (_, i) => {
    const material = new UnlitMaterial(engine);
    material.baseColor.set(i / 8, 0.5, 1, 1);
    return material;
  });
  for (let i = 0; i < 16; ++i) {
    const entity = root.createChild();
    entity.transform.setPosition((i - 7.5) / 8, 0, 0);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(materials[i % materials.length]);
    renderer.priority = i;
  }
  engine.update();
  engine.update();
  const gl = engine._hardwareRenderer.gl;
  const uploads = vi.spyOn(gl, "bufferSubData");
  const draws = vi.spyOn(gl, "drawElements");
  engine.update();
  expect(draws).toHaveBeenCalledTimes(16);
  expect(uploads.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER)).toHaveLength(0);
  expect(gl.getError()).toBe(gl.NO_ERROR);
});

it("revalidates calculated transforms and live material values across cameras and same-frame overrides", () => {
  const root = engine.sceneManager.activeScene.createRootEntity();
  const cameras = [0, 0.75].map((x) => {
    const camera = root.createChild().addComponent(Camera);
    camera.entity.transform.setPosition(x, 0, 5);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    const texture = new Texture2D(engine, 8, 8, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, 8, 8, texture);
    return { camera, texture };
  });
  const renderer = root.createChild().addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const material = new UnlitMaterial(engine);
  material.baseColor.set(1, 0, 0, 1);
  renderer.setMaterial(material);
  const draw = (index: number, x = 4) => {
    const { camera, texture } = cameras[index];
    camera.render();
    const pixel = new Uint8Array(4);
    texture.getPixelBuffer(x, 4, 1, 1, pixel);
    return Array.from(pixel);
  };

  cameras[1].camera.enabled = false;
  engine.update();
  engine.update();
  engine.update();
  expect(draw(0)).toEqual([255, 0, 0, 255]);
  material.baseColor.set(0, 1, 0, 1);
  expect(draw(0)).toEqual([0, 255, 0, 255]);
  expect(draw(1)).not.toEqual([0, 255, 0, 255]);
  expect(draw(1, 1)).toEqual([0, 255, 0, 255]);
  expect(draw(0)).toEqual([0, 255, 0, 255]);
  const mvp = renderer.shaderData.getMatrix("renderer_MVPMat");
  mvp.elements.fill(0);
  expect(draw(0)).toEqual([0, 255, 0, 255]);
  renderer.shaderData.setColor("material_BaseColor", new Color(0, 0, 1, 1));
  expect(draw(0)).toEqual([0, 0, 255, 255]);
});

it("bounds both candidates and resident pages and falls back for additional renderers", () => {
  shader = Shader.create(`Shader "Test/RendererRangeBudget" { SubShader "s" { Pass "p" {
    float rendererBudgetValue;
    void vert() { gl_Position = vec4(0.0); }
    void frag() { gl_FragColor = vec4(rendererBudgetValue); }
    VertexShader = vert; FragmentShader = frag;
  } } }`);
  const device = engine._hardwareRenderer;
  // High legal alignment exercises the actual memory limit with only a few dozen draws per page.
  Object.assign(device, { uniformBufferOffsetAlignment: 8192 });
  const scene = engine.sceneManager.activeScene.shaderData;
  const program = shader.subShaders[0].passes[0]._getShaderProgram(engine, new ShaderMacroCollection());
  const owners = Array.from({ length: 256 }, (_, i) => {
    const renderer = new ShaderData(ShaderDataGroup.Renderer);
    renderer.setFloat("rendererBudgetValue", i + 1);
    return renderer;
  });
  const upload = vi.spyOn(device.gl, "bufferSubData");
  const allocate = vi.spyOn(device.gl, "bufferData");
  function drawAll(): number {
    engine.update();
    upload.mockClear();
    allocate.mockClear();
    for (const renderer of owners) program.bindUniformBlocks(scene, undefined, renderer);
    return upload.mock.calls.length;
  }
  expect(drawAll()).toBe(owners.length);
  const used = engine._rendererUniformCacheBytes;
  expect(used).toBeGreaterThan(0);
  expect(used).toBeLessThanOrEqual(2 * 1024 * 1024);
  const allocatedPages = () => allocate.mock.calls.filter(([, bytes]) => typeof bytes === "number" && bytes > 16384);
  expect(allocatedPages()).toHaveLength(0);
  drawAll();
  expect(allocatedPages().length).toBeGreaterThan(0);
  const overflow = drawAll();
  expect(overflow).toBeGreaterThan(0);
  expect(overflow).toBeLessThan(owners.length);
  expect(drawAll()).toBe(overflow);
  expect(engine._rendererUniformCacheBytes).toBe(used);
  shader.destroy(true);
  expect(engine._rendererUniformCacheBytes).toBe(0);
  expect(device.gl.getError()).toBe(device.gl.NO_ERROR);
});
