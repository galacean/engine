import {
  shaderLibrary,
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
  ShadowCasterSource,
  BlitSource,
  BlitScreenSource,
  ParticleSource,
  ParticleFeedbackSource,
  UberSource,
  FinalSRGBSource,
  FinalAntiAliasingSource,
  BloomSource,
  ScalableAmbientOcclusionSource
} from "@galacean/engine-shader";
import { ShaderFactory } from "./ShaderFactory";
import { Shader } from "./Shader";
import { ShaderPass } from "./ShaderPass";

/**
 * Internal shader pool.
 * @internal
 */
export class ShaderPool {
  /** @internal */
  static particleFeedbackPass: ShaderPass;

  static init(): void {
    // Register every entry of the built-in shader library so `#include` can resolve them.
    for (const item of shaderLibrary) {
      ShaderFactory.registerInclude(item.path, item.source);
    }
  }

  /**
   * Register all built-in shaders from precompiled .gsp sources.
   */
  static registerShaders(): void {
    const sources = [
      // Pipeline / Blit shaders must be created first — material shaders UsePass from them
      BlitSource,
      BlitScreenSource,
      ShadowCasterSource,
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
      // Particle shaders
      ParticleSource,
      ParticleFeedbackSource,
      // PostProcess shaders
      UberSource,
      FinalSRGBSource,
      FinalAntiAliasingSource,
      BloomSource,
      // AO shader
      ScalableAmbientOcclusionSource
    ];

    for (const source of sources) {
      Shader._createFromPrecompiled(source);
    }

    // Cache the particle feedback pass and configure transform feedback varyings
    const feedbackPass = Shader.find("Effect/ParticleFeedback").subShaders[0].passes[0];
    feedbackPass._feedbackVaryings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
    ShaderPool.particleFeedbackPass = feedbackPass;
  }
}
