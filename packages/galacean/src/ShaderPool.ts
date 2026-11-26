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
  SunLensFlareSource,
  SunLensFlareVisibilitySource,
  VolumetricLightSource,
  ProbeDepthCaptureSource,
  RealtimeIBLAccumulateSource,
  RealtimeIBLProjectSHSource,
  RealtimeIBLResolveSource,
  ScalableAmbientOcclusionSource,
  ScreenSpaceReflectionSource,
  SSRReceiverSource,
  SSRContributionDepthSource,
  VolumetricCloudSource,
  WindGpuFieldSource,
  WindGpuGroundResponseSource,
  WindGpuTreeResponseSource
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
  static createShaders(): BuiltinShaders {
    const sources = [
      // Pipeline / Blit shaders must be created first — material shaders UsePass from them
      BlitSource,
      BlitScreenSource,
      ShadowCasterSource,
      DepthOnlySource,
      SSRReceiverSource,
      SSRContributionDepthSource,
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
      SpineSource,
      // Particle shaders
      ParticleSource,
      ParticleFeedbackSource,
      // PostProcess shaders
      UberSource,
      FinalSRGBSource,
      FinalAntiAliasingSource,
      BloomSource,
      SunLensFlareSource,
      SunLensFlareVisibilitySource,
      VolumetricLightSource,
      // Probe baking shader
      ProbeDepthCaptureSource,
      // Environment IBL baking shaders
      RealtimeIBLAccumulateSource,
      RealtimeIBLProjectSHSource,
      RealtimeIBLResolveSource,
      // AO shader
      ScalableAmbientOcclusionSource,
      // Screen-space reflection Hi-Z trace, temporal resolve, and color pyramid shader
      ScreenSpaceReflectionSource,
      // World environment shaders
      VolumetricCloudSource,
      WindGpuFieldSource,
      WindGpuGroundResponseSource,
      WindGpuTreeResponseSource
      // Gaussian Splatting shader
    ];

    const shaders = new Map(sources.map((source) => [source, Shader._createFromPrecompiled(source)] as const));

    // Keep feedback configuration on the same shader objects returned to Engine.
    const projectSphericalHarmonicsPass = shaders.get(RealtimeIBLProjectSHSource)!.subShaders[0].passes[0];
    projectSphericalHarmonicsPass._feedbackVaryings = [
      "v_SH0",
      "v_SH1",
      "v_SH2",
      "v_SH3",
      "v_SH4",
      "v_SH5",
      "v_SH6",
      "v_SH7",
      "v_SH8"
    ];
    const blendSphericalHarmonicsPass = shaders.get(RealtimeIBLProjectSHSource)!.subShaders[0].passes[1];
    blendSphericalHarmonicsPass._feedbackVaryings = ["v_SH"];

    const sunLensFlareVisibilityPass = shaders.get(SunLensFlareVisibilitySource)!.subShaders[0].passes[0];
    sunLensFlareVisibilityPass._feedbackVaryings = ["v_NextVisibility"];

    return {
      blit: shaders.get(BlitSource)!,
      blitScreen: shaders.get(BlitScreenSource)!,
      pbr: shaders.get(PBRSource)!,
      blinnPhong: shaders.get(BlinnPhongSource)!,
      unlit: shaders.get(UnlitSource)!,
      skybox: shaders.get(SkyboxSource)!,
      skyProcedural: shaders.get(SkyProceduralSource)!,
      backgroundTexture: shaders.get(BackgroundTextureSource)!,
      sprite: shaders.get(SpriteSource)!,
      spriteMask: shaders.get(SpriteMaskSource)!,
      text: shaders.get(TextSource)!,
      trail: shaders.get(TrailSource)!,
      ui: shaders.get(UIDefaultSource)!,
      spine: shaders.get(SpineSource)!,
      particle: shaders.get(ParticleSource)!,
      particleFeedback: shaders.get(ParticleFeedbackSource)!,
      uber: shaders.get(UberSource)!,
      finalSRGB: shaders.get(FinalSRGBSource)!,
      finalAntiAliasing: shaders.get(FinalAntiAliasingSource)!,
      bloom: shaders.get(BloomSource)!,
      scalableAmbientOcclusion: shaders.get(ScalableAmbientOcclusionSource)!,
      screenSpaceReflection: shaders.get(ScreenSpaceReflectionSource)!
    };
  }
}
