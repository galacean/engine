import {
  Camera,
  Color,
  Downsampling,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderQueueType,
  RenderTarget,
  Scene,
  ScreenSpaceReflection,
  ScreenSpaceReflectionActivationMode,
  ScreenSpaceReflectionContent,
  ScreenSpaceReflectionReceiverMode,
  ScreenSpaceReflectionUpsamplingMode,
  Shader,
  ShaderLanguage,
  Texture2D,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const transparentReceiverShaderSource = `
Shader "Test/SSROpaqueReuseReceiver" {
  SubShader "Default" {
    Pass "Forward" {
      Tags {
        pipelineStage = "Forward",
        screenSpaceReflectionTransparentSample = "SampleV1"
      }
      RenderQueueType = Transparent;
      DepthState = { Enabled = true; WriteEnabled = false; }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 clipPos; };
      sampler2D camera_OpaqueTexture;
      sampler2D camera_ScreenSpaceReflectionTexture;
      float camera_ScreenSpaceReflectionIntensity;
      Varyings vert(Attributes a) {
        Varyings o;
        o.clipPos = renderer_MVPMat * a.POSITION;
        gl_Position = o.clipPos;
        return o;
      }
      void frag(Varyings v) {
        vec2 uv = (v.clipPos.xy / v.clipPos.w) * 0.5 + 0.5;
        vec3 bg = texture2D(camera_OpaqueTexture, uv).rgb;
        vec4 ssr = texture2D(camera_ScreenSpaceReflectionTexture, uv) * camera_ScreenSpaceReflectionIntensity;
        gl_FragColor = vec4(mix(bg, ssr.rgb, ssr.a), 1.0);
      }
    }
    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV3"
      }
      RenderQueueType = Transparent;
      DepthState = { Enabled = true; WriteEnabled = true; }
      BlendState = { Enabled = false; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"
      struct Attributes { vec4 POSITION; };
      struct Varyings { float unused; };
      Varyings vert(Attributes a) {
        Varyings o;
        o.unused = 0.0;
        gl_Position = renderer_MVPMat * a.POSITION;
        return o;
      }
      void frag(Varyings v) {
        gl_FragColor = packScreenSpaceReflectionSurface(vec3(0.0, 1.0, 0.0), 0.05, 1.0);
      }
    }
  }
}
`;

const contributorShaderSource = `
Shader "Test/SSRDeferredMipContributor" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      RenderQueueType = Transparent;
      DepthState = { Enabled = true; WriteEnabled = false; }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      struct Attributes { vec4 POSITION; };
      struct Varyings { float unused; };
      Varyings vert(Attributes a) {
        Varyings o;
        o.unused = 0.0;
        gl_Position = renderer_MVPMat * a.POSITION;
        return o;
      }
      void frag(Varyings v) {
        gl_FragColor = vec4(0.9, 0.2, 0.1, 0.8);
      }
    }
    Pass "ContributionColor" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionContributionColor",
        screenSpaceReflectionContribution = "ColorDepthV1"
      }
      RenderQueueType = Transparent;
      DepthState = { Enabled = true; WriteEnabled = false; }
      BlendState = {
        Enabled = true;
        SourceColorBlendFactor = BlendFactor.SourceAlpha;
        DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
        SourceAlphaBlendFactor = BlendFactor.One;
        DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      struct Attributes { vec4 POSITION; };
      struct Varyings { float unused; };
      Varyings vert(Attributes a) {
        Varyings o;
        o.unused = 0.0;
        gl_Position = renderer_MVPMat * a.POSITION;
        return o;
      }
      void frag(Varyings v) {
        gl_FragColor = vec4(0.9, 0.2, 0.1, 0.8);
      }
    }
    Pass "ContributionDepth" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionContributionDepth",
        screenSpaceReflectionContribution = "ColorDepthV1"
      }
      RenderQueueType = Transparent;
      DepthState = { Enabled = true; WriteEnabled = true; }
      BlendState = { Enabled = false; ColorWriteMask = ColorWriteMask.None; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      struct Attributes { vec4 POSITION; };
      struct Varyings { float unused; };
      Varyings vert(Attributes a) {
        Varyings o;
        o.unused = 0.0;
        gl_Position = renderer_MVPMat * a.POSITION;
        return o;
      }
      void frag(Varyings v) {
        gl_FragColor = vec4(0.0);
      }
    }
  }
}
`;

let engine: WebGLEngine;
let canvas: HTMLCanvasElement;

beforeAll(async () => {
  canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  document.body.appendChild(canvas);
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  engine.canvas.setResolution(128, 128);
});

afterAll(() => {
  engine.destroy();
  canvas.remove();
});

describe("SSR general pipeline optimizations", () => {
  it("reuses SSR sceneColor for camera_OpaqueTexture when opaque composite did not run and dimensions match", () => {
    const scene = new Scene(engine, "ssr-opaque-reuse");
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.1, 0.3, 0.6, 1);

    const cameraEntity = scene.createRootEntity("cam");
    cameraEntity.transform.setPosition(0, 3, 5);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.opaqueTextureEnabled = true;
    camera.opaqueTextureDownsampling = Downsampling.TwoX;
    camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOn;
    camera.screenSpaceReflection.useHalfResolutionInputs = true;
    camera.screenSpaceReflection.upsamplingMode = ScreenSpaceReflectionUpsamplingMode.Bilinear;
    camera.screenSpaceReflection.resolutionScale = 0.5;

    const output = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false);
    const rt = new RenderTarget(engine, 128, 128, output, TextureFormat.Depth24, 1);
    camera.renderTarget = rt;

    const opaqueFloor = scene.createRootEntity("floor").addComponent(MeshRenderer);
    opaqueFloor.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
    const opaqueMat = new PBRMaterial(engine);
    opaqueMat.emissiveColor.set(0.2, 0.6, 0.2, 1);
    opaqueMat.roughness = 0.05;
    opaqueMat.screenSpaceReflection = { mode: "Off", intensity: 0 };
    opaqueFloor.setMaterial(opaqueMat);

    const waterShader = Shader.find("Test/SSROpaqueReuseReceiver") ?? Shader.create(transparentReceiverShaderSource, ShaderLanguage.GLSLES300)!;
    const waterMat = new Material(engine, waterShader);
    ScreenSpaceReflection.setMaterialReceiver(waterMat, ScreenSpaceReflectionReceiverMode.TransparentSampleOnly);
    const water = scene.createRootEntity("water").addComponent(MeshRenderer);
    water.mesh = PrimitiveMesh.createPlane(engine, 6, 6);
    water.entity.transform.setPosition(0, 0.2, 0);
    water.setMaterial(waterMat);

    const pipeline = (camera as unknown as {
      _renderPipeline: {
        _opaqueTexturePass: { _renderTarget: RenderTarget | null };
        _screenSpaceReflectionPass: { sceneColorTexture: Texture2D | null };
      };
    })._renderPipeline;

    // 1. Half-res SSR + TwoX opaqueTexture, no opaque composite -> reuses SSR sceneColor without allocating OpaqueTexturePass RT.
    camera.render();
    const reusedTex = camera.shaderData.getTexture("camera_OpaqueTexture") as Texture2D;
    expect(reusedTex).toBeTruthy();
    expect([reusedTex.width, reusedTex.height]).toEqual([64, 64]);
    expect(pipeline._opaqueTexturePass._renderTarget ?? null).toBeNull();

    // 2. Request full-res opaqueTexture (Downsampling.None) while SSR is half-res -> must NOT reuse half-res texture.
    camera.opaqueTextureDownsampling = Downsampling.None;
    camera.render();
    const fullTex = camera.shaderData.getTexture("camera_OpaqueTexture") as Texture2D;
    expect([fullTex.width, fullTex.height]).toEqual([128, 128]);
    expect(pipeline._opaqueTexturePass._renderTarget).not.toBeNull();

    // 3. Enable opaque SSR composite -> opaque composite modifies internalColorTarget, so OpaqueTexturePass must run fresh.
    camera.opaqueTextureDownsampling = Downsampling.None;
    opaqueMat.screenSpaceReflection = { mode: "On", intensity: 1 };
    camera.render();
    expect(camera.screenSpaceReflection.metrics.compositePassCount).toBe(1);
    expect(pipeline._opaqueTexturePass._renderTarget).not.toBeNull();

    // 4. Disable opaque SSR and return to TwoX -> reuses SSR sceneColor again and releases OpaqueTexturePass RT.
    opaqueMat.screenSpaceReflection = { mode: "Off", intensity: 0 };
    camera.opaqueTextureDownsampling = Downsampling.TwoX;
    camera.render();
    expect(pipeline._opaqueTexturePass._renderTarget).toBeNull();

    rt.destroy();
    output.destroy();
    scene.destroy();
  });

  it("fuses bilateral upsampling into OpaqueComposite without allocating resolvedTraceTarget while keeping scene mipmaps valid", () => {
    const scene = new Scene(engine, "ssr-fused-upsample");
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.05, 0.05, 0.1, 1);

    const cameraEntity = scene.createRootEntity("cam");
    cameraEntity.transform.setPosition(0, 2.5, 4.5);
    cameraEntity.transform.lookAt(new Vector3(0, 0.3, 0));
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOn;
    camera.screenSpaceReflection.resolutionScale = 0.5;
    camera.screenSpaceReflection.upsamplingMode = ScreenSpaceReflectionUpsamplingMode.GaussianBilateral;
    camera.screenSpaceReflection.reflectionContent = ScreenSpaceReflectionContent.OpaqueAndTransparent;

    const output = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false);
    const rt = new RenderTarget(engine, 128, 128, output, TextureFormat.Depth24, 1);
    camera.renderTarget = rt;

    const floor = scene.createRootEntity("mirror").addComponent(MeshRenderer);
    floor.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
    const mirror = new PBRMaterial(engine);
    mirror.metallic = 1;
    mirror.roughness = 0.05;
    mirror.emissiveColor.set(0.1, 0.1, 0.15, 1);
    mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
    floor.setMaterial(mirror);

    const contributorShader =
      Shader.find("Test/SSRDeferredMipContributor") ??
      Shader.create(contributorShaderSource, ShaderLanguage.GLSLES300)!;
    const contributorMat = new Material(engine, contributorShader);
    contributorMat.contributeScreenSpaceReflection = true;
    const panel = scene.createRootEntity("panel").addComponent(MeshRenderer);
    panel.mesh = PrimitiveMesh.createCuboid(engine, 1.5, 1.5, 0.2);
    panel.entity.transform.setPosition(0, 0.85, 0);
    panel.setMaterial(contributorMat);

    const stages: string[] = [];
    let resolvedTraceDuringComposite: RenderTarget | null = null;
    camera.screenSpaceReflection.profiler = {
      beginSample(stage) {
        stages.push(stage);
        if (stage === "composite") {
          const pass = (camera as unknown as {
            _renderPipeline: { _screenSpaceReflectionPass: { _resolvedTraceTarget: RenderTarget | null } };
          })._renderPipeline._screenSpaceReflectionPass;
          resolvedTraceDuringComposite = pass._resolvedTraceTarget;
        }
      },
      endSample() {}
    };

    camera.render();
    const metrics = camera.screenSpaceReflection.metrics;
    expect(metrics.compositePassCount).toBe(1);
    expect(metrics.upsamplePassCount).toBe(0);
    expect(resolvedTraceDuringComposite).toBeNull();
    expect(stages).toContain("contribution-mipmap");
    expect(stages).toContain("scene-mipmap");
    expect(stages).not.toContain("upsample");

    const pixels = new Uint8Array(128 * 128 * 4);
    output.getPixelBuffer(0, 0, 128, 128, 0, pixels);
    // Reflection of the red contributor panel must be visible on the mirror floor (lower half of screen).
    let reflectedRedPixels = 0;
    for (let y = 0; y < 60; y++) {
      for (let x = 20; x < 108; x++) {
        const i = (y * 128 + x) * 4;
        if (pixels[i] > pixels[i + 2] + 15) reflectedRedPixels++;
      }
    }
    expect(reflectedRedPixels).toBeGreaterThan(20);

    camera.screenSpaceReflection.profiler = null;
    rt.destroy();
    output.destroy();
    scene.destroy();
  });

  it("keeps reused camera_OpaqueTexture mip-complete when transparent contributors are active", () => {
    const mipReaderShaderSource = `
Shader "Test/SSROpaqueMipReader" {
  SubShader "Default" {
    Pass "Forward" {
      Tags {
        pipelineStage = "Forward",
        screenSpaceReflectionTransparentSample = "SampleV1"
      }
      RenderQueueType = Transparent;
      DepthState = { Enabled = true; WriteEnabled = false; }
      BlendState = { Enabled = false; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 clipPos; };
      sampler2D camera_OpaqueTexture;
      Varyings vert(Attributes a) {
        Varyings o;
        o.clipPos = renderer_MVPMat * a.POSITION;
        gl_Position = o.clipPos;
        return o;
      }
      void frag(Varyings v) {
        vec2 uv = (v.clipPos.xy / v.clipPos.w) * 0.5 + 0.5;
        vec3 mipColor = texture2DLodEXT(camera_OpaqueTexture, uv, 2.0).rgb;
        gl_FragColor = vec4(mipColor, 1.0);
      }
    }
    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV3"
      }
      RenderQueueType = Transparent;
      DepthState = { Enabled = true; WriteEnabled = true; }
      BlendState = { Enabled = false; }
      VertexShader = vert;
      FragmentShader = frag;
      #include "ShaderLibrary/Common/Common.glsl"
      #include "ShaderLibrary/Common/Transform.glsl"
      #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflection.glsl"
      struct Attributes { vec4 POSITION; };
      struct Varyings { float unused; };
      Varyings vert(Attributes a) {
        Varyings o;
        o.unused = 0.0;
        gl_Position = renderer_MVPMat * a.POSITION;
        return o;
      }
      void frag(Varyings v) {
        gl_FragColor = packScreenSpaceReflectionSurface(vec3(0.0, 1.0, 0.0), 0.05, 1.0);
      }
    }
  }
}
`;

    const scene = new Scene(engine, "ssr-opaque-reuse-mip");
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.05, 0.75, 0.1, 1);

    const cameraEntity = scene.createRootEntity("cam");
    cameraEntity.transform.setPosition(0, 3, 5);
    cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = false;
    camera.opaqueTextureEnabled = true;
    camera.opaqueTextureDownsampling = Downsampling.None;
    camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOn;
    camera.screenSpaceReflection.useHalfResolutionInputs = false;
    camera.screenSpaceReflection.reflectionContent = ScreenSpaceReflectionContent.OpaqueAndTransparent;

    const output = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false);
    const rt = new RenderTarget(engine, 128, 128, output, TextureFormat.Depth24, 1);
    camera.renderTarget = rt;

    const contributorShader =
      Shader.find("Test/SSRDeferredMipContributor") ??
      Shader.create(contributorShaderSource, ShaderLanguage.GLSLES300)!;
    const contributorMat = new Material(engine, contributorShader);
    contributorMat.contributeScreenSpaceReflection = true;
    const panel = scene.createRootEntity("panel").addComponent(MeshRenderer);
    panel.mesh = PrimitiveMesh.createCuboid(engine, 0.5, 0.5, 0.5);
    panel.entity.transform.setPosition(2.5, 2.5, -2);
    panel.setMaterial(contributorMat);

    const mipReaderShader =
      Shader.find("Test/SSROpaqueMipReader") ?? Shader.create(mipReaderShaderSource, ShaderLanguage.GLSLES300)!;
    const mipReaderMat = new Material(engine, mipReaderShader);
    ScreenSpaceReflection.setMaterialReceiver(mipReaderMat, ScreenSpaceReflectionReceiverMode.TransparentSampleOnly);
    const water = scene.createRootEntity("water").addComponent(MeshRenderer);
    water.mesh = PrimitiveMesh.createPlane(engine, 12, 12);
    water.entity.transform.setPosition(0, 0, 0);
    water.setMaterial(mipReaderMat);

    const pipeline = (camera as unknown as {
      _renderPipeline: {
        _opaqueTexturePass: { _renderTarget: RenderTarget | null };
      };
    })._renderPipeline;

    camera.render();

    expect(pipeline._opaqueTexturePass._renderTarget ?? null).toBeNull();
    const pixels = new Uint8Array(128 * 128 * 4);
    output.getPixelBuffer(0, 0, 128, 128, 0, pixels);
    const center = (64 * 128 + 64) * 4;
    // Mip level 2 must reflect the green opaque background rather than uninitialized black texels.
    expect(pixels[center + 1]).toBeGreaterThan(120);
    expect(pixels[center + 1]).toBeGreaterThan(pixels[center] + 60);
    expect(pixels[center + 1]).toBeGreaterThan(pixels[center + 2] + 60);

    rt.destroy();
    output.destroy();
    scene.destroy();
  });

  it("skips scene-color mipmap generation while preserving glossy transparent SSR reflections when useSceneColorMipmaps is false", () => {
    const scene = new Scene(engine, "ssr-no-scene-mipmaps");
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0.02, 0.02, 0.05, 1);

    const cameraEntity = scene.createRootEntity("cam");
    cameraEntity.transform.setPosition(0, 2.5, 4.5);
    cameraEntity.transform.lookAt(new Vector3(0, 0.3, 0));
    const camera = cameraEntity.addComponent(Camera);
    camera.enableHDR = true;
    camera.opaqueTextureEnabled = true;
    camera.opaqueTextureDownsampling = Downsampling.TwoX;
    camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOn;
    camera.screenSpaceReflection.useHalfResolutionInputs = true;
    camera.screenSpaceReflection.useSceneColorMipmaps = false;
    camera.screenSpaceReflection.upsamplingMode = ScreenSpaceReflectionUpsamplingMode.Bilinear;
    camera.screenSpaceReflection.resolutionScale = 0.25;
    camera.screenSpaceReflection.maxRaySteps = 24;
    camera.screenSpaceReflection.hitRefinementSteps = 2;

    const output = new Texture2D(engine, 129, 131, TextureFormat.R8G8B8A8, false);
    const rt = new RenderTarget(engine, 129, 131, output, TextureFormat.Depth24, 1);
    camera.renderTarget = rt;

    // Dark opaque floor beneath water so only a live SSR reflection turns reflected pixels red.
    const floor = scene.createRootEntity("floor").addComponent(MeshRenderer);
    floor.mesh = PrimitiveMesh.createPlane(engine, 12, 12);
    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor.set(0, 0, 0, 1);
    floorMat.emissiveColor.set(0.02, 0.02, 0.02, 1);
    floorMat.screenSpaceReflection = { mode: "Off", intensity: 0 };
    floor.setMaterial(floorMat);

    // Bright red opaque wall behind water to reflect onto the water receiver.
    const wall = scene.createRootEntity("wall").addComponent(MeshRenderer);
    wall.mesh = PrimitiveMesh.createCuboid(engine, 3, 2, 0.3);
    wall.entity.transform.setPosition(0, 1.0, -0.5);
    const wallMat = new PBRMaterial(engine);
    wallMat.baseColor.set(0, 0, 0, 1);
    wallMat.emissiveColor.set(0.95, 0.05, 0.05, 1);
    wallMat.screenSpaceReflection = { mode: "Off", intensity: 0 };
    wall.setMaterial(wallMat);

    const waterShader =
      Shader.find("Test/SSROpaqueReuseReceiver") ??
      Shader.create(transparentReceiverShaderSource, ShaderLanguage.GLSLES300)!;
    const waterMat = new Material(engine, waterShader);
    ScreenSpaceReflection.setMaterialReceiver(waterMat, ScreenSpaceReflectionReceiverMode.TransparentSampleOnly);
    const water = scene.createRootEntity("water").addComponent(MeshRenderer);
    water.mesh = PrimitiveMesh.createPlane(engine, 8, 8);
    water.entity.transform.setPosition(0, 0.2, 0);
    water.setMaterial(waterMat);

    const stages: string[] = [];
    camera.screenSpaceReflection.profiler = {
      beginSample(stage) {
        stages.push(stage);
      },
      endSample() {}
    };

    const pipeline = (camera as unknown as {
      _renderPipeline: {
        _opaqueTexturePass: { _renderTarget: RenderTarget | null };
        _screenSpaceReflectionPass: { sceneColorTexture: Texture2D | null };
      };
    })._renderPipeline;

    try {
      camera.render();
      expect(stages).toContain("scene-copy");
      expect(stages).not.toContain("scene-mipmap");
      expect(stages).toContain("trace");
      expect(pipeline._opaqueTexturePass._renderTarget ?? null).toBeNull();
      const reusedTex = camera.shaderData.getTexture("camera_OpaqueTexture") as Texture2D;
      expect([reusedTex.width, reusedTex.height]).toEqual([65, 66]);
      expect(reusedTex.mipmapCount).toBe(1);

      const pixels = new Uint8Array(129 * 131 * 4);
      output.getPixelBuffer(0, 0, 129, 131, 0, pixels);
      let reflectedRedPixels = 0;
      for (let y = 0; y < 70; y++) {
        for (let x = 20; x < 109; x++) {
          const i = (y * 129 + x) * 4;
          if (pixels[i] > 100 && pixels[i] > pixels[i + 1] + 50 && pixels[i] > pixels[i + 2] + 50) {
            reflectedRedPixels++;
          }
        }
      }
      expect(reflectedRedPixels).toBeGreaterThan(20);
    } finally {
      camera.screenSpaceReflection.profiler = null;
      rt.destroy();
      output.destroy();
      scene.destroy();
    }
  });
});
