import { BuiltinShaders, Shader, ShaderFactory } from "@galacean/engine-core";
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
  SpineSource,
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
 * @internal
 */
export class ShaderPool {
  static init(): void {
    // Register every entry of the built-in shader library so `#include` can resolve them.
    for (const item of shaderLibrary) {
      ShaderFactory.registerInclude(item.path, item.source);
    }
  }

  static createShaders(): BuiltinShaders {
    const blit = Shader._createFromPrecompiled(BlitSource);
    const blitScreen = Shader._createFromPrecompiled(BlitScreenSource);
    // Material shaders resolve UsePass references during creation
    Shader._createFromPrecompiled(ShadowCasterSource);
    Shader._createFromPrecompiled(DepthOnlySource);

    return {
      blit,
      blitScreen,
      pbr: Shader._createFromPrecompiled(PBRSource),
      blinnPhong: Shader._createFromPrecompiled(BlinnPhongSource),
      unlit: Shader._createFromPrecompiled(UnlitSource),
      skybox: Shader._createFromPrecompiled(SkyboxSource),
      skyProcedural: Shader._createFromPrecompiled(SkyProceduralSource),
      backgroundTexture: Shader._createFromPrecompiled(BackgroundTextureSource),
      sprite: Shader._createFromPrecompiled(SpriteSource),
      spriteMask: Shader._createFromPrecompiled(SpriteMaskSource),
      text: Shader._createFromPrecompiled(TextSource),
      trail: Shader._createFromPrecompiled(TrailSource),
      ui: Shader._createFromPrecompiled(UIDefaultSource),
      spine: Shader._createFromPrecompiled(SpineSource),
      particle: Shader._createFromPrecompiled(ParticleSource),
      particleFeedback: Shader._createFromPrecompiled(ParticleFeedbackSource),
      uber: Shader._createFromPrecompiled(UberSource),
      finalSRGB: Shader._createFromPrecompiled(FinalSRGBSource),
      finalAntiAliasing: Shader._createFromPrecompiled(FinalAntiAliasingSource),
      bloom: Shader._createFromPrecompiled(BloomSource),
      scalableAmbientOcclusion: Shader._createFromPrecompiled(ScalableAmbientOcclusionSource)
    };
  }
}
