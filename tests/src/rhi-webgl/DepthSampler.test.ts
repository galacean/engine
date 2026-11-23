import {
  Camera,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  Texture2D,
  TextureDepthCompareFunction,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { expect, it } from "vitest";

it("samples one depth texture as raw and comparison data in the same draw", async () => {
  const engine = await WebGLEngine.create({
    canvas: document.createElement("canvas"),
    shaderCompiler: new ShaderCompiler()
  });
  const shader = Shader.create(`Shader "Tests/DepthSampler" { SubShader "Default" { Pass "Forward" {
    mat4 renderer_MVPMat;
    mediump sampler2D probeDepth;
    mediump sampler2DShadow probeShadow;
    struct Attributes { vec4 POSITION; };
    void vert(Attributes a) { gl_Position = renderer_MVPMat * a.POSITION; }
    void frag() { gl_FragColor = vec4(texture(probeDepth, vec2(0.5)).r, texture(probeShadow, vec3(0.5,0.5,0.25)), 0.0, 1.0); }
    VertexShader = vert;
    FragmentShader = frag;
  } } }`);
  try {
    const scene = engine.sceneManager.activeScene;
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 3);
    const color = new Texture2D(engine, 8, 8, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, 8, 8, color);
    const depth = new Texture2D(engine, 1, 1, TextureFormat.Depth16, false, false);
    depth.setPixelBuffer(new Uint16Array([32768]));
    const meshRenderer = scene.createRootEntity().addComponent(MeshRenderer);
    meshRenderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const material = new Material(engine, shader);
    material.shaderData.setTexture("probeDepth", depth);
    material.shaderData.setTexture("probeShadow", depth);
    meshRenderer.setMaterial(material);
    const pixel = new Uint8Array(4);
    for (const [compare, expected] of [
      [TextureDepthCompareFunction.Less, 255],
      [TextureDepthCompareFunction.Greater, 0]
    ]) {
      depth.depthCompareFunction = compare;
      camera.render();
      color.getPixelBuffer(4, 4, 1, 1, pixel);
      expect(Array.from(pixel)).toEqual([128, expected, 0, 255]);
    }
    expect(engine._hardwareRenderer.gl.getError()).toBe(engine._hardwareRenderer.gl.NO_ERROR);
  } finally {
    engine.destroy();
    shader.destroy(true);
  }
});
