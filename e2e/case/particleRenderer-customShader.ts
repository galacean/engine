/**
 * @title Particle Custom Shader
 * @category Particle
 */
import {
  BoxShape,
  Camera,
  Color,
  Entity,
  Logger,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleMaterial,
  ParticleRenderer,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

const shaderCompiler = new ShaderCompiler();

// Custom particle shader: includes ParticleVert.glsl (which pulls in the
// factory-generated CustomData helpers) and reads two named custom streams:
//   - `Tint`     (gradient, vec4) — drives the per-particle color
//   - `OffsetX`  (curve, float)   — drives the per-particle X position offset
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
      #include "ShaderLibrary/Particle/Module/CustomData.glsl"

      Varyings vert(Attributes attr) {
          Varyings v;
          float age = renderer_CurrentTime - attr.a_DirectionTime.w;
          float normalizedAge = age / attr.a_ShapePositionStartLifeTime.w;
          if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
              vec3 center = computeParticleCenter(attr, age, normalizedAge, v);
              center.x += sampleParticleCustom_OffsetX(attr, normalizedAge);
              gl_Position = camera_ProjMat * camera_ViewMat * vec4(center, 1.0);
              vec4 tint = sampleParticleCustom_Tint(attr, normalizedAge);
              v.v_Color = computeParticleColor(attr, attr.a_StartColor, normalizedAge);
              v.v_Color.rgb *= tint.rgb;
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

  // Build the particle detached from the scene so the `ParticleRenderer`
  // `_onEnable` lifecycle hook does not fire until the generator + custom
  // shader are fully configured.
  const particleEntity = new Entity(engine, "CustomParticle");
  const particleRenderer = particleEntity.addComponent(ParticleRenderer);

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

  // Register named custom streams BEFORE creating the shader — the factory
  // bakes the per-stream `sampleParticleCustom_<Name>(...)` helpers into the
  // compiled shader. Streams added later won't be visible to this shader.
  customData.enabled = true;
  customData.addGradient("Tint", new ParticleCompositeGradient(new Color(1, 0.3, 0.1, 1)));
  customData.addCurve("OffsetX", new ParticleCompositeCurve(0.5));

  const customShader = particleRenderer.createCustomShader(customParticleShaderSource);
  const material = new ParticleMaterial(engine, customShader);
  material.baseColor = new Color(1, 1, 1, 1);
  particleRenderer.setMaterial(material);

  rootEntity.addChild(particleEntity);

  updateForE2E(engine, 500);
  initScreenshot(engine, camera);
});
