/**
 * @title Particle Custom Shader
 * @category Particle
 */
import {
  BoxShape,
  Camera,
  Color,
  Logger,
  ParticleCurveMode,
  ParticleMaterial,
  ParticleRenderer,
  Shader,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

const shaderCompiler = new ShaderCompiler();

// Custom particle shader: inline vert/frag that call engine helpers
// (computeParticleCenter / computeParticleColor) and read customData
// streams to drive position offset and color tint.
const customParticleShaderSource = `Shader "Test/ParticleCustom" {
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

      Varyings vert(Attributes attr) {
          Varyings v;
          float age = renderer_CurrentTime - attr.a_DirectionTime.w;
          float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
          if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
              vec3 center = computeParticleCenter(attr, age, normalizedAge, v);
              center += renderer_CustomData1MaxConst.xyz;
              gl_Position = camera_ProjMat * camera_ViewMat * vec4(center, 1.0);
              v.v_Color = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
              v.v_Color.rgb *= renderer_CustomData0MaxConst.rgb;
          } else {
              gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          }
          return v;
      }

      void frag(Varyings v) {
          gl_FragColor = v.v_Color;
      }
    }
  }
}`;

Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderCompiler }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.background.solidColor = new Color(0.05, 0.05, 0.05, 1);

  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.position = new Vector3(0, 0, 6);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;

  const customShader = Shader.create(customParticleShaderSource);

  const particleEntity = rootEntity.createChild("CustomParticle");
  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

  const material = new ParticleMaterial(engine, customShader);
  material.baseColor = new Color(1, 1, 1, 1);
  particleRenderer.setMaterial(material);

  const generator = particleRenderer.generator;
  generator.useAutoRandomSeed = false;

  const { main, emission, customData } = generator;
  main.duration = 5;
  main.startLifetime.constant = 1.5;
  main.startSpeed.constant = 0.5;
  main.startSize.constant = 0.3;
  main.startColor.constant = new Color(1, 1, 1, 1);

  emission.rateOverTime.constant = 30;
  const box = new BoxShape();
  box.size = new Vector3(2, 1, 0);
  emission.shape = box;

  // Drive color tint + position offset entirely from custom data
  customData.enabled = true;
  customData.data0.x.constantMax = 1.0; // R
  customData.data0.y.constantMax = 0.3; // G
  customData.data0.z.constantMax = 0.1; // B
  customData.data0.w.constantMax = 1.0;

  customData.data1.x.constantMax = 0.5; // +X offset
  customData.data1.y.constantMax = 0.0;
  customData.data1.z.constantMax = 0.0;
  customData.data1.w.constantMax = 0.0;

  updateForE2E(engine, 500);
  initScreenshot(engine, camera);
});
