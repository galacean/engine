import {
  fragmentList,
  PBRSource,
  BlinnPhongSource,
  UnlitSource,
  SpriteSource,
  SpriteMaskSource,
  TextSource,
  TrailSource,
  UIDefaultSource,
  SkyboxSource,
  BackgroundTextureSource,
  SkyProceduralSource,
  DepthOnlySource,
  ShadowMapSource,
  BlitSource,
  BlitScreenSource,
  ParticleSource,
  UberSource,
  FinalSRGBSource,
  FinalAntiAliasingSource,
  BloomSource,
  ScalableAmbientOcclusionSource
} from "@galacean/engine-shader";
import { IPrecompiledShader } from "@galacean/engine-design";
import { TransformFeedbackShader } from "../graphic/TransformFeedbackShader";
import { ShaderFactory } from "../shaderlib/ShaderFactory";
import { Shader } from "./Shader";

/**
 * Internal shader pool.
 * @internal
 */
export class ShaderPool {
  /** @internal */
  static particleFeedbackShader: TransformFeedbackShader;

  static init(): void {
    ShaderPool.particleFeedbackShader = new TransformFeedbackShader(
      `#include <Particle/ParticleFeedback.glsl>`,
      `void main() { discard; }`,
      ["v_FeedbackPosition", "v_FeedbackVelocity"]
    );

    // Register all include fragments (does not require ShaderLab)
    for (const fragment of fragmentList) {
      ShaderFactory.registerInclude(fragment.includeKey, fragment.source);
    }
  }

  /**
   * Register all built-in shaders.
   *
   * In release builds, sources are precompiled IPrecompiledShader objects
   * (registered via Shader._createFromPrecompiled, no ShaderLab needed).
   * In dev/test mode, sources are strings (registered via Shader.create, needs ShaderLab).
   */
  static registerShaders(): void {
    const sources: (string | IPrecompiledShader)[] = [
      // Utility shaders must be created first — material shaders UsePass from them
      BlitSource,
      BlitScreenSource,
      ShadowMapSource,
      DepthOnlySource,
      // Material shaders
      PBRSource,

      BlinnPhongSource,
      UnlitSource,
      // Sky shaders
      SkyboxSource,
      SkyProceduralSource,
      BackgroundTextureSource,
      // 2D shaders
      SpriteSource,
      SpriteMaskSource,
      TextSource,
      TrailSource,
      UIDefaultSource,
      // Particle shader
      ParticleSource,
      // PostProcess shaders
      UberSource,
      FinalSRGBSource,
      FinalAntiAliasingSource,
      BloomSource,
      // AO shader
      ScalableAmbientOcclusionSource
    ];

    for (const source of sources) {
      if (typeof source === "string") {
        Shader.create(source);
      } else {
        Shader._createFromPrecompiled(source);
      }
    }
  }
}
