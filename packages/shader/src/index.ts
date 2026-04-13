import { Shader, ShaderFactory } from "@galacean/engine";
import {
  fragmentList,
  PBRSource,
  PBRSpecularSource,
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
  UberShaderSource,
  FinalSRGBShaderSource,
  FinalAntiAliasingShaderSource,
  BloomShaderSource,
  SAOShaderSource
} from "./Shaders";

let includeRegistered = false;
let shaderRegistered = false;

export function registerIncludes() {
  if (includeRegistered) return;

  for (const sourceFragment of fragmentList) {
    ShaderFactory.registerInclude(sourceFragment.includeKey, sourceFragment.source);
  }

  includeRegistered = true;
}

/**
 * Register all built-in shaders via ShaderLab.
 * Must be called after engine creation (requires ShaderLab to be set).
 * Automatically calls registerIncludes() if not already done.
 */
export function registerShaders() {
  if (shaderRegistered) return;

  // Ensure include fragments are registered first
  registerIncludes();

  // Utility shaders must be created first — material shaders UsePass from them
  Shader.create(BlitSource);
  Shader.create(BlitScreenSource);
  Shader.create(ShadowMapSource);
  Shader.create(DepthOnlySource);

  // Material shaders — UsePass from Utility/ShadowMap and Utility/DepthOnly
  Shader.create(PBRSource);
  Shader.create(PBRSpecularSource);
  Shader.create(BlinnPhongSource);
  Shader.create(UnlitSource);

  // Sky shaders
  Shader.create(SkyboxSource);
  Shader.create(SkyProceduralSource);
  Shader.create(BackgroundTextureSource);

  // 2D shaders
  Shader.create(SpriteSource);
  Shader.create(SpriteMaskSource);
  Shader.create(TextSource);
  Shader.create(TrailSource);

  // Particle shader
  Shader.create(ParticleSource);

  // PostProcess shaders
  Shader.create(UberShaderSource);
  Shader.create(FinalSRGBShaderSource);
  Shader.create(FinalAntiAliasingShaderSource);
  Shader.create(BloomShaderSource);

  // AO shader
  Shader.create(SAOShaderSource);

  shaderRegistered = true;
}

export {
  PBRSource,
  PBRSpecularSource,
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
  UberShaderSource,
  FinalSRGBShaderSource,
  FinalAntiAliasingShaderSource,
  BloomShaderSource,
  SAOShaderSource,
  fragmentList
};
