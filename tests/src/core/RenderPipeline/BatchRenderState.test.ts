import {
  BlendFactor,
  Camera,
  Color,
  Entity,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderQueueType,
  Shader,
  ShaderData,
  ShaderDataGroup,
  Sprite,
  SpriteMask,
  SpriteMaskInteraction,
  SpriteRenderer,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import type { RenderContext } from "@galacean/engine-core/src/RenderPipeline/RenderContext";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Submit real mesh draws with batch data, without introducing a production renderer API.
class BatchRenderer extends MeshRenderer {
  batchData?: ShaderData;

  protected override _render(context: RenderContext): void {
    const element = this.engine._renderElementPool.get();
    element.set(this, this.getMaterial(), this.mesh._primitive, this.mesh.subMeshes[0]);
    if (this.batchData) element.shaderData = this.batchData;
    element.priority = this.priority;
    element.distanceForSort = this._distanceForSort;
    context.camera._renderPipeline.pushRenderElement(context, element);
  }
}

let shaderId = 0;
function pass(
  name: string,
  states = "",
  declarations = "",
  color = "vec4(1.0, 0.0, 0.0, 1.0)",
  stage = "Forward",
  queue = "Transparent"
) {
  return `Pass "${name}" {
    Tags { pipelineStage = "${stage}" }
    ${declarations}
    DepthState = { Enabled = false; WriteEnabled = false; }
    RasterState = { CullMode = CullMode.Off; }
    RenderQueueType = ${queue};
    ${states}
    mat4 renderer_MVPMat;
    struct a2v { vec3 POSITION; };
    void vert(a2v v) { gl_Position = renderer_MVPMat * vec4(v.POSITION, 1.0); }
    void frag() { gl_FragColor = ${color}; }
    VertexShader = vert;
    FragmentShader = frag;
  }`;
}

const writeStencil = `StencilState = {
  Enabled = true;
  ReferenceValue = 2;
  PassOperationFront = StencilOperation.Replace;
  PassOperationBack = StencilOperation.Replace;
}`;
const readStencil = `StencilState = {
  Enabled = true;
  ReferenceValue = 2;
  CompareFunctionFront = CompareFunction.Equal;
  CompareFunctionBack = CompareFunction.Equal;
}`;

describe("Batch render-state integration", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let camera: Camera;
  let canvas: HTMLCanvasElement;

  beforeEach(async () => {
    canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    engine = await WebGLEngine.create({
      canvas,
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { preserveDrawingBuffer: true, stencil: true }
    });
    root = engine.sceneManager.activeScene.createRootEntity();
    const cameraEntity = root.createChild();
    cameraEntity.transform.setPosition(0, 0, 3);
    camera = cameraEntity.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.enableHDR = false;
    engine.sceneManager.activeScene.background.solidColor = new Color(0, 0, 0, 1);
  });
  afterEach(() => engine.destroy());

  function material(...passes: string[]): Material {
    return new Material(
      engine,
      Shader.create(`Shader "BatchState${shaderId++}" { SubShader "Default" { ${passes.join("\n")} } }`)
    );
  }
  function draw(mat: Material, priority = 0): BatchRenderer {
    const renderer = root.createChild().addComponent(BatchRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 0.1);
    renderer.setMaterial(mat);
    renderer.priority = priority;
    return renderer;
  }
  function pixel(x: number): number[] {
    const gl = canvas.getContext("webgl2")!;
    const result = new Uint8Array(4);
    gl.readPixels(x, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, result);
    expect(gl.getError()).to.equal(0);
    return Array.from(result).slice(0, 3);
  }
  function addMaskAndSprite(priority: number): void {
    const texture = new Texture2D(engine, 1, 1);
    texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    const sprite = new Sprite(engine, texture);
    const mask = root.createChild().addComponent(SpriteMask);
    mask.sprite = sprite;
    mask.width = 1;
    mask.height = 2;
    mask.entity.transform.setPosition(-0.5, 0, 0);
    const renderer = root.createChild().addComponent(SpriteRenderer);
    renderer.sprite = sprite;
    renderer.width = renderer.height = 2;
    renderer.color = new Color(0, 0, 1, 1);
    renderer.priority = priority;
    renderer.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
  }

  for (const source of ["constant", "batch"] as const) {
    it(`preserves ${source} stencil writes when sprite masks are inserted and removed between passes`, () => {
      const declarations = source === "batch" ? "Number renderElement_TestStencilReference;" : "";
      const state =
        source === "batch"
          ? writeStencil.replace("ReferenceValue = 2", "ReferenceValue = renderElement_TestStencilReference")
          : writeStencil;
      const writer = draw(
        material(pass("Write", `${state} BlendState = { ColorWriteMask = ColorWriteMask.None; }`, declarations))
      );
      if (source === "batch") {
        writer.batchData = new ShaderData(ShaderDataGroup.RenderElement);
        writer.batchData.setInt("renderElement_TestStencilReference", 2);
      }
      addMaskAndSprite(1);
      draw(material(pass("Read", readStencil)), 2);
      engine.update();
      // The custom stencil value must survive both inside and outside the sprite mask.
      expect(pixel(16)).to.deep.equal([255, 0, 0]);
      expect(pixel(48)).to.deep.equal([255, 0, 0]);
    });
  }

  it("removes active sprite masks before an external stencil writer and rebuilds them for subsequent sprites", () => {
    addMaskAndSprite(0);
    draw(material(pass("Write", `${writeStencil} BlendState = { ColorWriteMask = ColorWriteMask.None; }`)), 1);
    addMaskAndSprite(2);
    draw(material(pass("Read", readStencil)), 3);
    engine.update();
    expect(pixel(16)).to.deep.equal([255, 0, 0]);
    expect(pixel(48)).to.deep.equal([255, 0, 0]);
  });

  it("only counts executed passes as stencil writers and honors the mask-interaction write override", () => {
    const dynamicWrite = writeStencil.replace(
      "Enabled = true;",
      "Enabled = true; WriteMask = renderElement_TestStencilWriteMask;"
    );
    const renderer = draw(
      material(
        pass("Unused", writeStencil, "", "vec4(1.0)", "ShadowCaster"),
        pass("Visible", dynamicWrite, "Number renderElement_TestStencilWriteMask;")
      )
    );
    const data = (renderer.batchData = new ShaderData(ShaderDataGroup.RenderElement));
    data.setInt("renderElement_TestStencilWriteMask", 0);
    engine.update();
    expect(engine.sceneManager.activeScene._maskManager.hasStencilWritten).to.be.false;
    data.setInt("renderElement_TestStencilWriteMask", 255);
    engine.update();
    expect(engine.sceneManager.activeScene._maskManager.hasStencilWritten).to.be.true;
    renderer._maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
    engine.update();
    expect(engine.sceneManager.activeScene._maskManager.hasStencilWritten).to.be.false;
  });

  it("routes batch queue parameters consistently and executes every matching pass", () => {
    const mat = material(
      pass(
        "Transparent",
        "BlendState = { Enabled = true; DestinationColorBlendFactor = BlendFactor.One; }",
        "",
        "vec4(0.0, 1.0, 0.0, 1.0)"
      ),
      pass(
        "Base",
        "",
        "RenderQueueType renderElement_TestQueue;",
        "vec4(1.0, 0.0, 0.0, 1.0)",
        "Forward",
        "renderElement_TestQueue"
      )
    );
    const renderer = draw(mat);
    const data = (renderer.batchData = new ShaderData(ShaderDataGroup.RenderElement));
    for (const queue of [RenderQueueType.Opaque, RenderQueueType.AlphaTest]) {
      data.setInt("renderElement_TestQueue", queue);
      engine.update();
      expect(pixel(32)).to.deep.equal([255, 255, 0]);
      const results = camera._renderPipeline._cullingResults;
      expect(results.transparentQueue.batchedElements).to.have.length(1);
      expect(
        (queue === RenderQueueType.Opaque ? results.opaqueQueue : results.alphaTestQueue).batchedElements
      ).to.have.length(1);
    }
  });

  it("keeps distinct batch parameters separate and clears them when pooled draws are reused", () => {
    const mat = material(
      pass(
        "Default",
        "BlendState = { Enabled = true; SourceColorBlendFactor = renderElement_TestBlendSource; }",
        "BlendFactor renderElement_TestBlendSource;"
      )
    );
    const a = draw(mat);
    const b = draw(mat);
    b.mesh = a.mesh;
    a.entity.transform.setScale(0.5, 1, 1);
    b.entity.transform.setScale(0.5, 1, 1);
    a.entity.transform.setPosition(-0.5, 0, 0);
    b.entity.transform.setPosition(0.5, 0, 0);
    a.batchData = new ShaderData(ShaderDataGroup.RenderElement);
    b.batchData = new ShaderData(ShaderDataGroup.RenderElement);
    a.batchData.setInt("renderElement_TestBlendSource", BlendFactor.Zero);
    b.batchData.setInt("renderElement_TestBlendSource", BlendFactor.One);
    engine.update();
    const queue = camera._renderPipeline._cullingResults.transparentQueue;
    expect(queue.batchedElements).to.have.length(2);
    expect(pixel(16)).to.deep.equal([0, 0, 0]);
    expect(pixel(48)).to.deep.equal([255, 0, 0]);
    b.batchData = a.batchData;
    engine.update();
    expect(queue.batchedElements).to.have.length(1);
    a.batchData = b.batchData = undefined;
    engine.update();
    expect(queue.batchedElements).to.have.length(1);
    expect(queue.batchedElements[0].shaderData).to.be.undefined;
    expect(pixel(16)).to.deep.equal([255, 0, 0]);
    expect(pixel(48)).to.deep.equal([255, 0, 0]);
  });
});
