import {
  ParticleRenderer,
  ParticleMaterial,
  Camera,
  Entity,
  ParticleCurveMode,
  ParticleGradientMode,
  Engine,
  ParticleStopMode,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleCurve,
  CurveKey
} from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, beforeAll, beforeEach, afterAll, expect, it } from "vitest";

describe("CustomDataModule", function () {
  let engine: Engine;
  let particleRenderer: ParticleRenderer;
  let entity: Entity;

  beforeAll(async function () {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: new LitePhysics(),
      shaderCompiler: new ShaderCompiler()
    });
    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity("root");

    const cameraEntity = rootEntity.createChild("camera");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, -10);
    cameraEntity.transform.lookAt(new Vector3());

    entity = rootEntity.createChild("particle");
    particleRenderer = entity.addComponent(ParticleRenderer);
    const material = new ParticleMaterial(engine);
    material.baseColor = new Color(1.0, 1.0, 1.0, 1.0);
    particleRenderer.setMaterial(material);

    engine.run();
  });

  afterAll(function () {
    engine.destroy();
  });

  beforeEach(function () {
    particleRenderer.generator.stop(true, ParticleStopMode.StopEmittingAndClear);

    const customData = particleRenderer.generator.customData;
    customData.enabled = false;
    for (const name of Object.keys(customData.curves)) {
      customData.removeCurve(name);
    }
    for (const name of Object.keys(customData.gradients)) {
      customData.removeGradient(name);
    }
  });

  it("starts empty", function () {
    const customData = particleRenderer.generator.customData;
    expect(customData.enabled).to.eq(false);
    expect(Object.keys(customData.curves).length).to.eq(0);
    expect(Object.keys(customData.gradients).length).to.eq(0);
  });

  it("addCurve registers and stores by reference", function () {
    const customData = particleRenderer.generator.customData;
    const curve = new ParticleCompositeCurve(1.0);
    expect(customData.addCurve("intensity", curve)).to.eq(true);
    expect(customData.curves["intensity"]).to.eq(curve);
  });

  it("addCurve rejects invalid identifiers", function () {
    const customData = particleRenderer.generator.customData;
    expect(customData.addCurve("", new ParticleCompositeCurve(0))).to.eq(false);
    expect(customData.addCurve("0bad", new ParticleCompositeCurve(0))).to.eq(false);
    expect(customData.addCurve("has space", new ParticleCompositeCurve(0))).to.eq(false);
    expect(customData.addCurve("dash-name", new ParticleCompositeCurve(0))).to.eq(false);
    expect(Object.keys(customData.curves).length).to.eq(0);
  });

  it("addCurve rejects duplicate name (own + cross with gradients)", function () {
    const customData = particleRenderer.generator.customData;
    expect(customData.addCurve("foo", new ParticleCompositeCurve(1))).to.eq(true);
    expect(customData.addCurve("foo", new ParticleCompositeCurve(2))).to.eq(false);
    expect(customData.addGradient("foo", new ParticleCompositeGradient(new Color(1, 1, 1, 1)))).to.eq(false);
  });

  it("addGradient registers and stores by reference", function () {
    const customData = particleRenderer.generator.customData;
    const gradient = new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1));
    expect(customData.addGradient("tint", gradient)).to.eq(true);
    expect(customData.gradients["tint"]).to.eq(gradient);
  });

  it("removeCurve / removeGradient clear entries", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("a", new ParticleCompositeCurve(1));
    customData.addGradient("b", new ParticleCompositeGradient(new Color()));
    expect(customData.removeCurve("a")).to.eq(true);
    expect(customData.removeGradient("b")).to.eq(true);
    expect(customData.removeCurve("a")).to.eq(false);
    expect(customData.removeGradient("b")).to.eq(false);
    expect(Object.keys(customData.curves).length).to.eq(0);
    expect(Object.keys(customData.gradients).length).to.eq(0);
  });

  it("_updateShaderData no-op when disabled", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("intensity", new ParticleCompositeCurve(1));
    customData.enabled = false;
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("_updateShaderData handles all curve modes", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.addCurve("c1", new ParticleCompositeCurve(1));
    customData.addCurve("c2", new ParticleCompositeCurve(1, 5));
    customData.addCurve("c3", new ParticleCompositeCurve(new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 1))));
    customData.addCurve(
      "c4",
      new ParticleCompositeCurve(
        new ParticleCurve(new CurveKey(0, 0), new CurveKey(1, 0.5)),
        new ParticleCurve(new CurveKey(0, 0.5), new CurveKey(1, 1))
      )
    );
    expect(customData.curves["c2"].mode).to.eq(ParticleCurveMode.TwoConstants);
    expect(customData.curves["c4"].mode).to.eq(ParticleCurveMode.TwoCurves);
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("_updateShaderData handles gradient constant + twoConstants", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.addGradient("g1", new ParticleCompositeGradient(new Color(1, 0.5, 0.25, 1)));
    customData.addGradient("g2", new ParticleCompositeGradient(new Color(0, 0, 0, 1), new Color(1, 1, 1, 1)));
    expect(customData.gradients["g2"].mode).to.eq(ParticleGradientMode.TwoConstants);
    expect(() => {
      //@ts-ignore
      customData._updateShaderData(particleRenderer.shaderData);
    }).to.not.throw();
  });

  it("createCustomShader produces a compilable shader with per-stream helpers", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.addCurve("intensity", new ParticleCompositeCurve(0.8));
    customData.addGradient("tint", new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1)));

    const shaderSource = `Shader "Test/CustomDataHelpers" {
      SubShader "Default" {
        Pass "Forward Pass" {
          Tags { pipelineStage = "Forward" }
          RenderQueueType renderQueueType;
          BlendFactor sourceColorBlendFactor;
          BlendFactor destinationColorBlendFactor;
          BlendFactor sourceAlphaBlendFactor;
          BlendFactor destinationAlphaBlendFactor;
          CullMode rasterStateCullMode;
          Bool blendEnabled;
          Bool depthWriteEnabled;
          BlendState = {
            Enabled = blendEnabled;
            SourceColorBlendFactor = sourceColorBlendFactor;
            DestinationColorBlendFactor = destinationColorBlendFactor;
            SourceAlphaBlendFactor = sourceAlphaBlendFactor;
            DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
          }
          DepthState = { WriteEnabled = depthWriteEnabled; }
          RasterState = { CullMode = rasterStateCullMode; }
          RenderQueueType = renderQueueType;
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Particle/ParticleVert.glsl"
          #include "ShaderLibrary/Particle/Module/CustomData.glsl"
          Varyings vert(Attributes attr) {
              Varyings v;
              float age = renderer_CurrentTime - attr.a_DirectionTime.w;
              float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
              vec3 center = computeParticleCenter(attr, age, normalizedAge, v);
              float intensity = sampleParticleCustom_Intensity(attr, normalizedAge);
              vec4 tint = sampleParticleCustom_Tint(attr, normalizedAge);
              v.v_Color = vec4(tint.rgb * intensity, tint.a);
              gl_Position = camera_ProjMat * camera_ViewMat * vec4(center, 1.0);
              return v;
          }
          void frag(Varyings v) { gl_FragColor = v.v_Color; }
        }
      }
    }`;

    expect(() => particleRenderer.createCustomShader(shaderSource)).to.not.throw();
  });

  it("createCustomShader restores include map after each call", function () {
    const customData = particleRenderer.generator.customData;
    customData.addCurve("a", new ParticleCompositeCurve(1));
    particleRenderer.createCustomShader(`Shader "Test/IsolateA" {
      SubShader "Default" { Pass "Forward Pass" {
        VertexShader = vert; FragmentShader = frag;
        #include "ShaderLibrary/Particle/ParticleVert.glsl"
        Varyings vert(Attributes attr) { Varyings v; gl_Position = vec4(0); return v; }
        void frag(Varyings v) { gl_FragColor = vec4(1); }
      } }
    }`);
    customData.removeCurve("a");
    customData.addCurve("b", new ParticleCompositeCurve(2));
    expect(() =>
      particleRenderer.createCustomShader(`Shader "Test/IsolateB" {
        SubShader "Default" { Pass "Forward Pass" {
          VertexShader = vert; FragmentShader = frag;
          #include "ShaderLibrary/Particle/ParticleVert.glsl"
          #include "ShaderLibrary/Particle/Module/CustomData.glsl"
          Varyings vert(Attributes attr) { Varyings v; gl_Position = vec4(0); return v; }
          void frag(Varyings v) { gl_FragColor = vec4(1); }
        } }
      }`)
    ).to.not.throw();
  });

  it("enabling module triggers engine update without error", function () {
    const customData = particleRenderer.generator.customData;
    customData.enabled = true;
    customData.addCurve("intensity", new ParticleCompositeCurve(1, 5));
    customData.addGradient("tint", new ParticleCompositeGradient(new Color(1, 0.5, 0.2, 1)));

    particleRenderer.generator.play();
    //@ts-ignore
    const originalVSyncCount = engine._vSyncCount;
    //@ts-ignore
    const originalLastSystemTime = engine._time._lastSystemTime;
    const originalNow = performance.now;
    try {
      //@ts-ignore
      engine._vSyncCount = Infinity;
      //@ts-ignore
      engine._time._lastSystemTime = 0;
      let times = 0;
      performance.now = function () {
        times++;
        return times * 100;
      };
      expect(() => {
        for (let i = 0; i < 10; ++i) {
          engine.update();
        }
      }).to.not.throw();
    } finally {
      performance.now = originalNow;
      //@ts-ignore
      engine._vSyncCount = originalVSyncCount;
      //@ts-ignore
      engine._time._lastSystemTime = originalLastSystemTime;
    }
  });
});
