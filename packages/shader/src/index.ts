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
  ParticleSource
} from "./shaders";

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
 * Create a shader from ShaderLab source, replacing any existing shader with the same name.
 * @internal
 */
function _createShader(source: string): void {
  // Extract the shader name from `Shader "name" {` declaration
  const match = source.match(/Shader\s+"([^"]+)"/);
  if (match) {
    const name = match[1];
    if (Shader.find(name)) {
      // Remove existing shader (e.g., from ShaderPool's VS/FS fallback) to allow ShaderLab re-creation
      delete (Shader as any)._shaderMap[name];
    }
  }
  Shader.create(source);
}

/**
 * Register all built-in shaders via ShaderLab.
 * Must be called after engine creation (requires ShaderLab to be set).
 * Automatically calls registerIncludes() if not already done.
 * Replaces any existing shaders with the same name (e.g., from ShaderPool fallback).
 */
export function registerShaders() {
  if (shaderRegistered) return;

  // Ensure include fragments are registered first
  registerIncludes();

  // PBR must be created first — other shaders UsePass from "pbr/Default/ShadowCaster" and "pbr/Default/DepthOnly"
  _createShader(PBRSource);

  // Material shaders that UsePass from PBR
  _createShader(PBRSpecularSource);
  _createShader(BlinnPhongSource);
  _createShader(UnlitSource);

  // Utility shaders
  _createShader(BlitSource);
  _createShader(BlitScreenSource);
  _createShader(ShadowMapSource);
  _createShader(DepthOnlySource);

  // Sky shaders
  _createShader(SkyboxSource);
  _createShader(SkyProceduralSource);
  _createShader(BackgroundTextureSource);

  // 2D shaders
  _createShader(SpriteSource);
  _createShader(SpriteMaskSource);
  _createShader(TextSource);
  _createShader(TrailSource);

  // UIDefault ("ui") is created by the @galacean/engine-ui package lazily.
  // Export the source so it can be used if needed.

  // Particle shader
  _createShader(ParticleSource);

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
  fragmentList
};
