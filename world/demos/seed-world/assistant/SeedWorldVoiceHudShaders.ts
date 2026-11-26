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
import seedWorldVoiceOrbBakeShaderSourceAsset from "./shaders/SeedWorldVoiceOrbBake.shader?raw";
import seedWorldVoiceOrbDisplayShaderSourceAsset from "./shaders/SeedWorldVoiceOrbDisplay.shader?raw";
import seedWorldWorkingTextShaderSourceAsset from "./shaders/SeedWorldWorkingText.shader?raw";
import seedWorldUiAtlasTileShaderSourceAsset from "../src/shaders/SeedWorldUIAtlasTile.shader?raw";
import {
  SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
  seedWorldLiquidGlassShaderSource
} from "@galacean/engine-project/rendering/LiquidGlassPostProcessPass";

export {
  SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
  SeedWorldLiquidGlassUiMaterial,
  seedWorldLiquidGlassShaderSource
} from "@galacean/engine-project/rendering/LiquidGlassPostProcessPass";

export const SEED_WORLD_VOICE_ORB_BAKE_SHADER_NAME = "SeedWorld/VoiceOrbBakeV1";
export const SEED_WORLD_VOICE_ORB_DISPLAY_SHADER_NAME = "SeedWorld/VoiceOrbDisplayV1";
export const SEED_WORLD_WORKING_TEXT_SHADER_NAME = "SeedWorld/WorkingTextV1";
export const SEED_WORLD_UI_ATLAS_TILE_SHADER_NAME = "SeedWorld/UIAtlasTileV1";

/** Text-atlas shader with a Codex-style working sweep across the whole transcript plate. */
export const seedWorldWorkingTextShaderSource = seedWorldWorkingTextShaderSourceAsset;

export const seedWorldVoiceOrbBakeShaderSource = seedWorldVoiceOrbBakeShaderSourceAsset;
export const seedWorldVoiceOrbDisplayShaderSource = seedWorldVoiceOrbDisplayShaderSourceAsset;

/** Registers voice-HUD Shader sources before startup variant warmup. */
export function registerSeedWorldVoiceHudStartupShaders(): readonly string[] {
  if (!Shader.find(SEED_WORLD_LIQUID_GLASS_SHADER_NAME)) Shader.create(seedWorldLiquidGlassShaderSource);
  if (!Shader.find(SEED_WORLD_VOICE_ORB_BAKE_SHADER_NAME)) Shader.create(seedWorldVoiceOrbBakeShaderSource);
  if (!Shader.find(SEED_WORLD_VOICE_ORB_DISPLAY_SHADER_NAME)) Shader.create(seedWorldVoiceOrbDisplayShaderSource);
  if (!Shader.find(SEED_WORLD_WORKING_TEXT_SHADER_NAME)) Shader.create(seedWorldWorkingTextShaderSource);
  if (!Shader.find(SEED_WORLD_UI_ATLAS_TILE_SHADER_NAME)) Shader.create(seedWorldUiAtlasTileShaderSourceAsset);
  return Object.freeze([
    SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
    SEED_WORLD_VOICE_ORB_BAKE_SHADER_NAME,
    SEED_WORLD_VOICE_ORB_DISPLAY_SHADER_NAME,
    SEED_WORLD_WORKING_TEXT_SHADER_NAME,
    SEED_WORLD_UI_ATLAS_TILE_SHADER_NAME
  ]);
}
