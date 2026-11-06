/**
 * Runtime Galacean UI shaders used by the Seed World voice HUD.
 *
 * The orb is an adapted, attributed port of Peace's "Siri AI Orb":
 * https://www.shadertoy.com/view/msVBzw
 *
 * The liquid-glass material is shared with other HUD controls and re-exported
 * below so the voice HUD remains the canonical visual reference.
 */

import { Shader } from "@galacean/engine";
import seedWorldVoiceOrbShaderSourceAsset from "./shaders/SeedWorldVoiceOrb.shader?raw";
import seedWorldWorkingTextShaderSourceAsset from "./shaders/SeedWorldWorkingText.shader?raw";
import {
  SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
  seedWorldLiquidGlassShaderSource
} from "@galacean/engine-modify/rendering/LiquidGlassPostProcessPass";

export {
  SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
  SeedWorldLiquidGlassUiMaterial,
  seedWorldLiquidGlassShaderSource
} from "@galacean/engine-modify/rendering/LiquidGlassPostProcessPass";

export const SEED_WORLD_VOICE_ORB_SHADER_NAME = "SeedWorld/VoiceOrbV5";
export const SEED_WORLD_WORKING_TEXT_SHADER_NAME = "SeedWorld/WorkingTextV1";

/** Text-atlas shader with a Codex-style working sweep across the whole transcript plate. */
export const seedWorldWorkingTextShaderSource = seedWorldWorkingTextShaderSourceAsset;

export const seedWorldVoiceOrbShaderSource = seedWorldVoiceOrbShaderSourceAsset;

/** Registers the visible voice-HUD Shader sources before startup variant warmup. */
export function registerSeedWorldVoiceHudStartupShaders(): readonly string[] {
  if (!Shader.find(SEED_WORLD_LIQUID_GLASS_SHADER_NAME)) Shader.create(seedWorldLiquidGlassShaderSource);
  if (!Shader.find(SEED_WORLD_VOICE_ORB_SHADER_NAME)) Shader.create(seedWorldVoiceOrbShaderSource);
  return Object.freeze([SEED_WORLD_LIQUID_GLASS_SHADER_NAME, SEED_WORLD_VOICE_ORB_SHADER_NAME]);
}
