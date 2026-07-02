import { Shader, ShaderFactory } from "@galacean/engine-core";
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

/**
 * Built-in shader pool. Lives in the `@galacean/engine` umbrella because the
 * specific set of bundled shaders is a property of the Galacean flavor of the
 * engine — `engine-core` is a generic runtime that knows nothing about which
 * shaders ship in the box.
 *
 * @internal
 */
export class ShaderPool {
  static init(): void {
    // Register every entry of the built-in shader library so `#include` can resolve them.
    for (const item of shaderLibrary) {
      ShaderFactory.registerInclude(item.path, item.source);
    }
  }

  /**
   * Register all built-in shaders from precompiled `.shaderc` sources, plus
   * configure the particle feedback pass's transform-feedback varyings.
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
      // @ts-expect-error — `_createFromPrecompiled` is `Shader` @internal.
      Shader._createFromPrecompiled(source);
    }

    // Configure the particle feedback pass's transform-feedback varyings.
    // The pass itself is later looked up via `Shader.find` inside
    // `ParticleTransformFeedbackSimulator`, so no caching needed here.
    const feedbackPass = Shader.find("Effect/ParticleFeedback").subShaders[0].passes[0];
    // @ts-expect-error — `_feedbackVaryings` is `ShaderPass` @internal.
    feedbackPass._feedbackVaryings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
  }
}
