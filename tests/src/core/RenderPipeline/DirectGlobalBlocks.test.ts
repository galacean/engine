import {
  BackgroundMode,
  BackgroundTextureFillMode,
  Blitter,
  Camera,
  Material,
  PostProcessPass,
  PrimitiveMesh,
  RenderTarget,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("global blocks outside the render queue", () => {
  let engine: WebGLEngine;
  let camera: Camera;
  let target: Texture2D;
  let shader: Shader | undefined;

  beforeEach(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 8;
    engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    camera = engine.sceneManager.activeScene.createRootEntity().addComponent(Camera);
    target = new Texture2D(engine, 8, 8, TextureFormat.R8G8B8A8_UNorm, false, false);
    camera.renderTarget = new RenderTarget(engine, 8, 8, target);
  });

  afterEach(() => {
    engine.destroy();
    shader?.destroy(true);
    shader = undefined;
  });

  function makeShader(name: string, pass: string): Shader {
    shader = Shader.create(`Shader "Tests/${name}" { SubShader "Default" { Pass "Forward" {
      uniform Scene { float scene_ProbeRed; };
      uniform Camera { mat4 camera_VPMat; vec4 camera_ProjectionParams; float camera_ProbeGreen; };
      VertexShader = vert;
      FragmentShader = frag;
      ${pass}
    } } }`);
    return shader;
  }

  function pixel(x = 4): number[] {
    const rgba = new Uint8Array(4);
    target.getPixelBuffer(x, 4, 1, 1, rgba);
    return Array.from(rgba);
  }

  it("renders a sky with the translation-free VP matrix and restores the camera after its draw", () => {
    const scene = engine.sceneManager.activeScene;
    scene.background.mode = BackgroundMode.Sky;
    scene.background.sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const skyShader = makeShader(
      "SkyGlobals",
      `
      RasterState = { CullMode = CullMode.Off; }
      DepthState = { CompareFunction = CompareFunction.LessEqual; }
      struct Attributes { vec3 POSITION; };
      void vert(Attributes a) { gl_Position = camera_VPMat * vec4(a.POSITION, 1.0); }
      void frag() { gl_FragColor = vec4(scene_ProbeRed, camera_ProbeGreen, 0.0, 1.0); }
    `
    );
    scene.background.sky.material = new Material(engine, skyShader);
    // With the ordinary camera matrix the unit cube is completely outside the view.
    camera.entity.transform.setPosition(100, 0, 5);
    scene.shaderData.setFloat("scene_ProbeRed", 1);
    camera.shaderData.setFloat("camera_ProbeGreen", 1);
    camera.render();
    expect(pixel()).toEqual([255, 255, 0, 255]);
    expect(camera.shaderData.getMatrix("camera_VPMat")).toBe(engine._renderContext.viewProjectionMatrix);
    expect(engine._hardwareRenderer.gl.getError()).toBe(engine._hardwareRenderer.gl.NO_ERROR);
  });

  it("binds the camera and scene while drawing the background texture mesh", () => {
    const scene = engine.sceneManager.activeScene;
    const background = scene.background;
    const source = new Texture2D(engine, 2, 1, TextureFormat.R8G8B8A8_UNorm, false, false);
    source.filterMode = TextureFilterMode.Point;
    source.setPixelBuffer(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]));
    background.mode = BackgroundMode.Texture;
    background.textureFillMode = BackgroundTextureFillMode.Fill;
    background.texture = source;
    background._material.shader = makeShader(
      "BackgroundGlobals",
      `
      DepthState = { CompareFunction = CompareFunction.LessEqual; }
      struct Attributes { vec3 POSITION; vec2 TEXCOORD_0; };
      struct Varyings { vec2 uv; };
      sampler2D material_BaseTexture;
      Varyings vert(Attributes a) {
        Varyings v;
        gl_Position = vec4(a.POSITION.x, a.POSITION.y * camera_ProjectionParams.x, a.POSITION.z, 1.0);
        v.uv = a.TEXCOORD_0;
        return v;
      }
      void frag(Varyings v) {
        gl_FragColor = texture2D(material_BaseTexture, v.uv) * vec4(scene_ProbeRed, 1.0, camera_ProbeGreen, 1.0);
      }
    `
    );
    scene.shaderData.setFloat("scene_ProbeRed", 1);
    camera.shaderData.setFloat("camera_ProbeGreen", 1);
    camera.render();
    expect(pixel(1)).toEqual([255, 0, 0, 255]);
    expect(pixel(6)).toEqual([0, 0, 255, 255]);
    expect(engine._hardwareRenderer.gl.getError()).toBe(engine._hardwareRenderer.gl.NO_ERROR);
  });

  it("combines the source texture with scene and camera data in a post-process blit", () => {
    const scene = engine.sceneManager.activeScene;
    const blitShader = makeShader(
      "BlitGlobals",
      `
      DepthState = { Enabled = false; WriteEnabled = false; }
      sampler2D renderer_BlitTexture;
      struct Attributes { vec4 POSITION_UV; };
      void vert(Attributes a) { gl_Position = vec4(a.POSITION_UV.xy, 0.0, 1.0); }
      void frag() {
        gl_FragColor = vec4(scene_ProbeRed, camera_ProbeGreen, texture2D(renderer_BlitTexture, vec2(0.5)).b, 1.0);
      }
    `
    );
    const material = new Material(engine, blitShader);
    class ProbePass extends PostProcessPass {
      onRender(camera: Camera, source: Texture2D, destination: RenderTarget | null): void {
        Blitter.blitTexture(engine, source, destination, 0, camera.viewport, material);
      }
    }
    engine.addPostProcessPass(new ProbePass(engine));
    camera.enablePostProcess = true;
    scene.background.solidColor.set(0, 0, 1, 1);
    scene.shaderData.setFloat("scene_ProbeRed", 1);
    camera.shaderData.setFloat("camera_ProbeGreen", 1);
    engine.update();
    expect(pixel()).toEqual([255, 255, 255, 255]);
    camera.shaderData.setFloat("camera_ProbeGreen", 0);
    engine.update();
    expect(pixel()).toEqual([255, 0, 255, 255]);
    expect(engine._hardwareRenderer.gl.getError()).toBe(engine._hardwareRenderer.gl.NO_ERROR);
  });
});
