import type { IPrecompiledComputeShader, IPrecompiledShader } from "@galacean/engine-design";
import { Shader } from "./Shader";

/**
 * @internal
 */
export interface BuiltinShaders {
  readonly byName: Readonly<Record<string, Shader>>;
  readonly computeByName: Readonly<Record<string, IPrecompiledComputeShader>>;
  readonly blit: Shader;
  readonly blitScreen: Shader;
  readonly pbr: Shader;
  readonly blinnPhong: Shader;
  readonly unlit: Shader;
  readonly skybox: Shader;
  readonly skyProcedural: Shader;
  readonly backgroundTexture: Shader;
  readonly sprite: Shader;
  readonly spriteMask: Shader;
  readonly text: Shader;
  readonly trail: Shader;
  readonly ui: Shader;
  readonly spine: Shader;
  readonly particle: Shader;
  readonly particleFeedback: Shader;
  readonly uber: Shader;
  readonly finalSRGB: Shader;
  readonly finalAntiAliasing: Shader;
  readonly bloom: Shader;
  readonly scalableAmbientOcclusion: Shader;
  readonly screenSpaceReflection: Shader;
}

/** @internal Precompiled assets supplied by the engine flavor. */
export interface BuiltinShaderSources {
  ShadowCasterSource: IPrecompiledShader;
  DepthOnlySource: IPrecompiledShader;
  BlitSource: IPrecompiledShader;
  BlitScreenSource: IPrecompiledShader;
  PBRSource: IPrecompiledShader;
  BlinnPhongSource: IPrecompiledShader;
  UnlitSource: IPrecompiledShader;
  SkyboxSource: IPrecompiledShader;
  SkyProceduralSource: IPrecompiledShader;
  BackgroundTextureSource: IPrecompiledShader;
  SpriteSource: IPrecompiledShader;
  SpriteMaskSource: IPrecompiledShader;
  TextSource: IPrecompiledShader;
  TrailSource: IPrecompiledShader;
  UIDefaultSource: IPrecompiledShader;
  SpineSource: IPrecompiledShader;
  ParticleSource: IPrecompiledShader;
  ParticleFeedbackSource: IPrecompiledShader;
  UberSource: IPrecompiledShader;
  FinalSRGBSource: IPrecompiledShader;
  FinalAntiAliasingSource: IPrecompiledShader;
  BloomSource: IPrecompiledShader;
  ScalableAmbientOcclusionSource: IPrecompiledShader;
  SSRReceiverSource: IPrecompiledShader;
  SSRContributionDepthSource: IPrecompiledShader;
  ScreenSpaceReflectionSource: IPrecompiledShader;
  SunLensFlareSource: IPrecompiledShader;
  SunLensFlareVisibilitySource: IPrecompiledShader;
  VolumetricLightSource: IPrecompiledShader;
  ProbeDepthCaptureSource: IPrecompiledShader;
  RealtimeIBLAccumulateSource: IPrecompiledShader;
  RealtimeIBLProjectSHSource: IPrecompiledShader;
  RealtimeIBLResolveSource: IPrecompiledShader;
  VolumetricCloudSource: IPrecompiledShader;
  WindGpuFieldSource: IPrecompiledShader;
  WindGpuGroundResponseSource: IPrecompiledShader;
  WindGpuTreeResponseSource: IPrecompiledShader;
  SunLensFlareVisibilityComputeSource?: IPrecompiledComputeShader;
  RealtimeIBLProjectSHComputeSource?: IPrecompiledComputeShader;
  ParticleSimulationComputeSource?: IPrecompiledComputeShader;
  ParticleSubEmitterGatherComputeSource?: IPrecompiledComputeShader;
}

/** @internal Creates a catalog, resolving common passes before material shaders. */
export function createBuiltinShaders(sources: BuiltinShaderSources): BuiltinShaders {
  const byName: Record<string, Shader> = Object.create(null);
  const computeByName: Record<string, IPrecompiledComputeShader> = Object.create(null);
  const registerCompute = (source?: IPrecompiledComputeShader): void => {
    if (source) computeByName[source.name] = source;
  };
  registerCompute(sources.SunLensFlareVisibilityComputeSource);
  registerCompute(sources.RealtimeIBLProjectSHComputeSource);
  registerCompute(sources.ParticleSimulationComputeSource);
  registerCompute(sources.ParticleSubEmitterGatherComputeSource);
  const create = (source: IPrecompiledShader): Shader =>
    (byName[source.name] = Shader._createFromPrecompiled(source, byName));
  // Material shaders resolve UsePass references during creation
  create(sources.ShadowCasterSource);
  create(sources.DepthOnlySource);
  create(sources.SSRReceiverSource);
  create(sources.SSRContributionDepthSource);
  create(sources.SunLensFlareSource);
  create(sources.VolumetricLightSource);
  create(sources.ProbeDepthCaptureSource);
  create(sources.RealtimeIBLAccumulateSource);
  create(sources.RealtimeIBLResolveSource);
  create(sources.VolumetricCloudSource);
  create(sources.WindGpuFieldSource);
  create(sources.WindGpuGroundResponseSource);
  create(sources.WindGpuTreeResponseSource);
  const projectSH = create(sources.RealtimeIBLProjectSHSource);
  projectSH.subShaders[0].passes[0]._feedbackVaryings = Array.from({ length: 9 }, (_, i) => "v_SH" + i);
  projectSH.subShaders[0].passes[1]._feedbackVaryings = ["v_SH"];
  create(sources.SunLensFlareVisibilitySource).subShaders[0].passes[0]._feedbackVaryings = ["v_NextVisibility"];

  return {
    byName,
    computeByName,
    screenSpaceReflection: create(sources.ScreenSpaceReflectionSource),
    blit: create(sources.BlitSource),
    blitScreen: create(sources.BlitScreenSource),
    pbr: create(sources.PBRSource),
    blinnPhong: create(sources.BlinnPhongSource),
    unlit: create(sources.UnlitSource),
    skybox: create(sources.SkyboxSource),
    skyProcedural: create(sources.SkyProceduralSource),
    backgroundTexture: create(sources.BackgroundTextureSource),
    sprite: create(sources.SpriteSource),
    spriteMask: create(sources.SpriteMaskSource),
    text: create(sources.TextSource),
    trail: create(sources.TrailSource),
    ui: create(sources.UIDefaultSource),
    spine: create(sources.SpineSource),
    particle: create(sources.ParticleSource),
    particleFeedback: create(sources.ParticleFeedbackSource),
    uber: create(sources.UberSource),
    finalSRGB: create(sources.FinalSRGBSource),
    finalAntiAliasing: create(sources.FinalAntiAliasingSource),
    bloom: create(sources.BloomSource),
    scalableAmbientOcclusion: create(sources.ScalableAmbientOcclusionSource)
  };
}
