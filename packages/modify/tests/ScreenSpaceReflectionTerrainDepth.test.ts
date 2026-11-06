import {
  Logger,
  Camera,
  Color,
  CompareFunction,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  RenderStateElementKey,
  Scene,
  Shader,
  ShaderFactory,
  ShaderLanguage,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureFormat,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { TerrainClipmap } from "../../terrain/src/terrain/clipmap/TerrainClipmap";
import terrainSource from "../../terrain/src/shaders/Terrain.shader?raw";
import { expect, it } from "vitest";

const SIZE = 256;
const HEIGHT_SIZE = 33;
const includes = import.meta.glob<string>("../../terrain/src/shaders/**/*.glsl", {
  query: "?raw",
  import: "default",
  eager: true
});
it("keeps Terrain Forward and Surface depth coverage consistent", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  try {
    for (const [path, source] of Object.entries(includes)) {
      ShaderFactory.registerInclude(path.split("/shaders/")[1], source);
    }
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.3, 0.3, 0.3, 1);
    scene.screenSpaceReflection.apply({
      activationMode: Activation.ForceOn,
      receiverPolicy: Policy.ExplicitOnly,
      edgeFade: 0,
      maxRaySteps: 64
    });
    scene.shaderData.setVector4("scene_SurfaceClimate", new Vector4(1, 1, 0, 1));
    scene.shaderData.setVector4("scene_TerrainWaterCoverageParams", new Vector4(1, 1, 1, 1));
    scene.shaderData.setVector4("scene_TerrainWaterSurfaceParams", new Vector4(0.02, 0.02, 1, 0));
    scene.shaderData.setVector4("scene_TerrainWaterOpticsParams", new Vector4(1, 1.333, 0, 0));
    scene.shaderData.setVector4("scene_TerrainRippleParams", new Vector4(1, 1, 1, 0));
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(3, 2.5, 6);
    camera.entity.transform.lookAt(new Vector3(0, 0.5, 0));
    const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
    camera.renderTarget = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24Stencil8);
    const source = new Material(engine, Shader.create(terrainSource, ShaderLanguage.GLSLES300)!);
    source.shaderData.setColor("material_BaseColor", new Color(0.2, 0.2, 0.2, 1));
    source.shaderData.setFloat("material_Smoothness", 0.5);
    source.shaderData.setInt("material_WorldPickDepthCompare", CompareFunction.Less);
    const terrain = new TerrainClipmap(
      engine,
      scene.createRootEntity("terrain"),
      camera,
      {
        vertexSpacing: 0.5,
        minHeight: 0,
        maxHeight: 0.1,
        sources: [
          {
            id: "depth-fixture",
            worldPosition: [-8, 0, -8],
            worldSize: [16, 1, 16],
            heightSampleSize: [HEIGHT_SIZE, HEIGHT_SIZE],
            heightDecodeOffset: 0,
            heightDecodeScale: 1,
            heightSamples: Uint16Array.from({ length: HEIGHT_SIZE * HEIGHT_SIZE }, (_, i) =>
              Math.round((0.5 + 0.5 * Math.sin(i % HEIGHT_SIZE)) * 1000)
            )
          }
        ]
      },
      source,
      8,
      2
    );
    const cube = scene.createRootEntity().addComponent(MeshRenderer);
    cube.mesh = PrimitiveMesh.createCuboid(engine, 1.5, 1.5, 1.5);
    cube.entity.transform.setPosition(0, 0.8, 0);
    const red = new PBRMaterial(engine);
    red.emissiveColor.set(1, 0, 0, 1);
    red.screenSpaceReflection = { mode: "Off", intensity: 0 };
    cube.setMaterial(red);
    let surface = new Uint8Array(SIZE * SIZE * 4);
    const pipeline = (
      camera as unknown as {
        _renderPipeline: {
          constructor: { _screenSpaceReflectionSurfaceStates: Record<number, number | boolean> };
          _screenSpaceReflectionPass: { _surfaceTarget: RenderTarget };
        };
      }
    )._renderPipeline;
    camera.screenSpaceReflection.profiler = {
      beginSample(stage) {
        if (stage === "trace") {
          surface = new Uint8Array(SIZE * SIZE * 4);
          (pipeline._screenSpaceReflectionPass._surfaceTarget.getColorTexture(0) as Texture2D).getPixelBuffer(
            0,
            0,
            SIZE,
            SIZE,
            0,
            surface
          );
        }
      },
      endSample() {}
    };
    const render = () => {
      engine.update();
      const p = new Uint8Array(SIZE * SIZE * 4);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, p);
      return p;
    };
    for (let frame = 0; frame < 20; frame++) {
      engine.update();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    for (const scale of [1, 0.5, 0.25]) {
      scene.screenSpaceReflection.resolutionScale = scale;
      scene.screenSpaceReflection.upsamplingMode = Upsampling.Bilateral;
      cube.entity.isActive = false;
      const states = pipeline.constructor._screenSpaceReflectionSurfaceStates;
      states[RenderStateElementKey.DepthStateCompareFunction] = CompareFunction.Always;
      render();
      const reference = surface;
      states[RenderStateElementKey.DepthStateCompareFunction] = CompareFunction.LessEqual;
      render();
      let coverage = 0;
      let missing = 0;
      for (let i = 3; i < surface.length; i += 4) {
        if (reference[i] > 0) {
          coverage++;
          if (surface[i] === 0) missing++;
        }
      }
      cube.entity.isActive = true;
      scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const off = render();
      scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      const on = render();
      let reflected = 0;
      for (let i = 0; i < on.length; i += 4) if (on[i] - on[i + 1] - (off[i] - off[i + 1]) > 5) reflected++;
      console.info(
        JSON.stringify({
          scale,
          coverage,
          missing,
          reflected,
          error: (
            engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } }
          )._hardwareRenderer.gl.getError()
        })
      );
      expect(coverage).toBeGreaterThan(1000);
      expect(missing).toBe(0);
      expect(reflected).toBeGreaterThan(0);
      expect(
        (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl.getError()
      ).toBe(0);
    }
    terrain.destroy();
  } finally {
    Logger.disable();
    engine.destroy();
  }
});
