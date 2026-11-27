import {
  Blitter,
  Camera,
  Material,
  MeshRenderer,
  PostProcessPass,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderMacroCollection,
  Texture2D,
  TextureFormat,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderPrecompiler } from "@galacean/engine-shader-compiler/precompile";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("automatically packed uniforms", () => {
  let engine: WebGLEngine;
  let camera: Camera;
  let target: Texture2D;
  let shader: Shader;

  beforeEach(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      shaderCompiler: new ShaderCompiler()
    });
    camera = engine.sceneManager.activeScene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 5);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    target = new Texture2D(engine, 8, 8, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, 8, 8, target);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    engine.destroy();
    shader?.destroy(true);
  });

  function pixel(x = 4): number[] {
    const rgba = new Uint8Array(4);
    target.getPixelBuffer(x, 4, 1, 1, rgba);
    return Array.from(rgba);
  }

  it.each(["gl_MaxDrawBuffers", "int(determinant(mat2(2.0)))", "int(length(cross(vec3(2,0,0),vec3(0,2,0))))"])(
    "draws with a GLSL-sized numeric array: %s",
    (bound) => {
      shader = Shader.create(`Shader "Test/ArrayBound" { SubShader "s" { Pass "p" {
      const int count = ${bound};
      vec4 colors[count];
      mat4 renderer_MVPMat;
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
      void frag() { gl_FragColor = colors[count - 1]; }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
      const gl = engine._hardwareRenderer.gl;
      const length = bound === "gl_MaxDrawBuffers" ? gl.getParameter(gl.MAX_DRAW_BUFFERS) : 4;
      const values = new Float32Array(length * 4);
      values.set([1, 0, 1, 1], values.length - 4);
      const renderer = engine.sceneManager.activeScene.createRootEntity().addComponent(MeshRenderer);
      renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      const material = new Material(engine, shader);
      material.shaderData.setFloatArray("colors", values);
      renderer.setMaterial(material);
      const query = vi.spyOn(gl, "getActiveUniform");
      camera.render();
      expect(pixel()).toEqual([255, 0, 255, 255]);
      expect(query).not.toHaveBeenCalled();
      expect(gl.getError()).toBe(gl.NO_ERROR);
    }
  );

  it("draws an authored sampler array whose macro supplies a GLSL-only constant expression", () => {
    const source = `Shader "Test/SamplerBound" { SubShader "s" { Pass "p" {
      sampler2D images[IMAGE_COUNT];
      mat4 renderer_MVPMat;
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
      void frag() { gl_FragColor = texture2D(images[IMAGE_COUNT - 1], vec2(0.5)); }
      VertexShader = vert; FragmentShader = frag;
    } } }`;
    const asset = JSON.parse(JSON.stringify(new ShaderPrecompiler().precompile(source)));
    shader = Shader._createFromPrecompiled(asset);
    const blue = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false, false);
    blue.setPixelBuffer(new Uint8Array([0, 0, 255, 255]));
    const magenta = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false, false);
    magenta.setPixelBuffer(new Uint8Array([255, 0, 255, 255]));
    const material = new Material(engine, shader);
    material.shaderData.enableMacro("IMAGE_COUNT", "int(length(cross(vec3(2,0,0), vec3(0,2,0))))");
    material.shaderData.setTextureArray("images", [blue, blue, blue, magenta]);
    const renderer = engine.sceneManager.activeScene.createRootEntity().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    renderer.setMaterial(material);
    camera.render();
    expect(pixel()).toEqual([255, 0, 255, 255]);
    expect(engine._hardwareRenderer.gl.getError()).toBe(engine._hardwareRenderer.gl.NO_ERROR);
  });

  it("selects the highest populated ShaderData group on each draw without enumerating driver uniforms", () => {
    shader = Shader.create(`Shader "Test/AutomaticOwners" { SubShader "s" { Pass "p" {
      vec4 ownerTint;
      mat4 renderer_MVPMat;
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
      void frag() { gl_FragColor = ownerTint; }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
    const gl = engine._hardwareRenderer.gl;
    const enumerate = vi.spyOn(gl, "getActiveUniform");
    const enumerateBlocks = vi.spyOn(gl, "getActiveUniformBlockName");
    const program = shader.subShaders[0].passes[0]._getShaderProgram(engine, new ShaderMacroCollection());
    expect(program.isValid).toBe(true);
    expect(enumerate).not.toHaveBeenCalled();
    expect(enumerateBlocks).not.toHaveBeenCalled();
    program.bind();
    expect(gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM), "ownerTint")).toBeNull();

    const scene = engine.sceneManager.activeScene;
    const renderer = scene.createRootEntity().addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new Material(engine, shader);
    renderer.setMaterial(material);
    const elementData = new ShaderData(ShaderDataGroup.RenderElement);
    const pipeline = camera._renderPipeline;
    const push = pipeline.pushRenderElement.bind(pipeline);
    vi.spyOn(pipeline, "pushRenderElement").mockImplementation((context, element) => {
      if (element.component === renderer) element.shaderData = elementData;
      push(context, element);
    });
    const owners = [scene.shaderData, camera.shaderData, material.shaderData, renderer.shaderData, elementData];
    const colors = [
      new Vector4(1, 0, 0, 1),
      new Vector4(0, 1, 0, 1),
      new Vector4(0, 0, 1, 1),
      new Vector4(0, 1, 1, 1),
      new Vector4(1, 0, 1, 1)
    ];
    const scatter = vi.spyOn(gl, "uniform4f");
    for (let i = 0; i < owners.length; ++i) {
      const color = colors[i];
      owners[i].setVector4("ownerTint", color);
      camera.render();
      expect(pixel()).toEqual([255 * color.x, 255 * color.y, 255 * color.z, 255]);
    }
    expect(scatter).not.toHaveBeenCalled();
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("retains two draws when a post-process pass changes the same material in place", () => {
    shader = Shader.create(`Shader "Test/AutomaticBlits" { SubShader "s" { Pass "p" {
      DepthState = { Enabled = false; WriteEnabled = false; }
      vec4 blitColor;
      sampler2D renderer_BlitTexture;
      struct Attributes { vec4 POSITION_UV; };
      void vert(Attributes a) { gl_Position = vec4(a.POSITION_UV.xy, 0.0, 1.0); }
      void frag() { gl_FragColor = blitColor * texture2D(renderer_BlitTexture, vec2(0.5)); }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
    const scene = engine.sceneManager.activeScene;
    scene.background.solidColor.set(1, 1, 1, 1);
    const material = new Material(engine, shader);
    const color = new Vector4(1, 0, 0, 1);
    material.shaderData.setVector4("blitColor", color);
    class TwoBlits extends PostProcessPass {
      override onRender(camera: Camera, source: Texture2D, destination: RenderTarget | null): void {
        Blitter.blitTexture(engine, source, destination, 0, new Vector4(0, 0, 0.5, 1), material);
        color.set(0, 1, 0, 1);
        Blitter.blitTexture(engine, source, destination, 0, new Vector4(0.5, 0, 0.5, 1), material);
      }
    }
    engine.addPostProcessPass(new TwoBlits(engine));
    camera.enablePostProcess = true;
    engine.update();
    expect(pixel(1)).toEqual([255, 0, 0, 255]);
    expect(pixel(6)).toEqual([0, 255, 0, 255]);
    expect(engine._hardwareRenderer.gl.getError()).toBe(engine._hardwareRenderer.gl.NO_ERROR);
  });

  it("reuses alternating material ranges until the packed value or GPU store changes", () => {
    shader = Shader.create(`Shader "Test/AlternatingMaterialRanges" { SubShader "s" { Pass "p" {
      DepthState = { Enabled = false; WriteEnabled = false; }
      vec4 alternatingColor;
      struct Attributes { vec4 POSITION_UV; };
      void vert(Attributes a) { gl_Position = vec4(a.POSITION_UV.xy, 0.0, 1.0); }
      void frag() { gl_FragColor = alternatingColor; }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
    const device = engine._hardwareRenderer;
    const gl = device.gl;
    // A 16 KiB buffer with 2 KiB aligned slices wraps after eight unique uploads.
    Object.assign(device, { uniformBufferOffsetAlignment: 2048 });
    const materials = Array.from({ length: 8 }, (_, i) => {
      const material = new Material(engine, shader);
      material.shaderData.setVector4("alternatingColor", new Vector4(i & 1, (i >> 1) & 1, (i >> 2) & 1, 1));
      return material;
    });
    const upload = vi.spyOn(gl, "bufferSubData");
    const allocate = vi.spyOn(gl, "bufferData");
    const bind = vi.spyOn(gl, "bindBuffer");
    let order = Array.from({ length: 24 }, (_, i) => i % 8);
    let uploads = 0;
    let allocations = 0;
    let genericUniformBinds = 0;
    class MaterialStripes extends PostProcessPass {
      override onRender(camera: Camera, source: Texture2D, destination: RenderTarget | null): void {
        upload.mockClear();
        allocate.mockClear();
        bind.mockClear();
        for (const i of order) {
          Blitter.blitTexture(engine, source, destination, 0, new Vector4(i / 8, 0, 1 / 8, 1), materials[i]);
        }
        uploads = upload.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER).length;
        allocations = allocate.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER).length;
        genericUniformBinds = bind.mock.calls.filter(([target]) => target === gl.UNIFORM_BUFFER).length;
      }
    }
    camera.enablePostProcess = true;
    engine.addPostProcessPass(new MaterialStripes(engine));
    engine.update();
    expect(uploads).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(pixel(i)).toEqual([255 * (i & 1), 255 * ((i >> 1) & 1), 255 * ((i >> 2) & 1), 255]);
    }

    materials[0].shaderData.getVector4("alternatingColor").set(0.5, 0.25, 0.75, 1);
    order = [0, 1, 0];
    engine.update();
    expect(allocations).toBe(1);
    expect(uploads).toBe(2);
    expect(genericUniformBinds).toBe(0);
    expect(pixel(0)).toEqual([128, 64, 191, 255]);
    expect(pixel(1)).toEqual([255, 0, 0, 255]);

    engine.resourceManager._lostGraphicResources();
    order = [0, 1];
    engine.update();
    expect(uploads).toBe(2);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });

  it("draws every batched renderer when one instance record cannot fit the device block limit", () => {
    shader = Shader.create(`Shader "Test/OversizedInstance" { SubShader "s" { Pass "p" {
      vec4 instanceColor;
      mat4 renderer_MVPMat;
      struct Attributes { vec4 POSITION; };
      void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
      void frag() { gl_FragColor = instanceColor; }
      VertexShader = vert;
      FragmentShader = frag;
    } } }`);
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new Material(engine, shader);
    const scene = engine.sceneManager.activeScene;
    for (let i = 0; i < 2; ++i) {
      const entity = scene.createRootEntity();
      entity.transform.setPosition(i === 0 ? -0.55 : 0.55, 0, 0);
      entity.transform.setScale(0.6, 1, 1);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      renderer.shaderData.setVector4("instanceColor", new Vector4(1 - i, i, 0, 1));
    }
    Object.assign(engine._hardwareRenderer, { maxUniformBlockSize: 16 });
    const batch = vi.spyOn(MeshRenderer.prototype, "_batch");
    const gl = engine._hardwareRenderer.gl;
    const instanced = vi.spyOn(gl, "drawElementsInstanced");
    camera.render();
    expect(batch.mock.calls.some(([leader]) => leader != null)).toBe(true);
    expect(instanced).not.toHaveBeenCalled();
    expect(pixel(2)).toEqual([255, 0, 0, 255]);
    expect(pixel(6)).toEqual([0, 255, 0, 255]);
    expect(gl.getError()).toBe(gl.NO_ERROR);
  });
});
