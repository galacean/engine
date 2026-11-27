/**
 * Runtime Galacean UI shaders used by the Seed World voice HUD.
 *
 * The orb is an adapted, attributed port of Peace's "Siri AI Orb":
 * https://www.shadertoy.com/view/msVBzw
 *
 * The liquid-glass material is shared with other HUD controls and re-exported
 * below so the voice HUD remains the canonical visual reference.
 */

import {
  Engine,
  Matrix,
  Shader,
  ShaderData,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";
import seedWorldVoiceOrbShaderSourceAsset from "./shaders/SeedWorldVoiceOrb.shader?raw";
import seedWorldWorkingTextShaderSourceAsset from "./shaders/SeedWorldWorkingText.shader?raw";
import {
  SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
  seedWorldLiquidGlassShaderSource
} from "@galacean/engine-project/rendering/LiquidGlassPostProcessPass";

export {
  SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
  SeedWorldLiquidGlassUiMaterial,
  seedWorldLiquidGlassShaderSource
} from "@galacean/engine-project/rendering/LiquidGlassPostProcessPass";

export const SEED_WORLD_VOICE_ORB_SHADER_NAME = "SeedWorld/VoiceOrbV5";
export const SEED_WORLD_WORKING_TEXT_SHADER_NAME = "SeedWorld/WorkingTextV1";
export const VOICE_ORB_SPECTRUM_LUT_WIDTH = 64;

/** Text-atlas shader with a Codex-style working sweep across the whole transcript plate. */
export const seedWorldWorkingTextShaderSource = seedWorldWorkingTextShaderSourceAsset;

export const seedWorldVoiceOrbShaderSource = seedWorldVoiceOrbShaderSourceAsset;

const TWO_PI = Math.PI * 2;

function wrapRadians(angle: number): number {
  const r = angle % TWO_PI;
  return r < 0 ? r + TWO_PI : r;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mixRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Builds the 64x1 RGBA8 cyclic pastel aurora palette LUT matching `evalAuroraSpectrum` in `SeedWorldVoiceOrb.shader`.
 */
export function buildVoiceOrbSpectrumLutPixels(
  cCyan: readonly [number, number, number],
  cAzure: readonly [number, number, number],
  cViolet: readonly [number, number, number],
  cOrchid: readonly [number, number, number],
  cRose: readonly [number, number, number],
  cCore: readonly [number, number, number],
  width = VOICE_ORB_SPECTRUM_LUT_WIDTH
): Uint8Array {
  const cCyanAzure = mixRgb(cCyan, cAzure, 0.55);
  const cAqua = mixRgb(cCyan, cCore, 0.18);
  const pixels = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const u = (i + 0.5) / width;
    let col = mixRgb(cCyan, cCyanAzure, smoothstep(0.0, 0.38, u));
    col = mixRgb(col, cViolet, smoothstep(0.38, 0.54, u));
    col = mixRgb(col, cOrchid, smoothstep(0.54, 0.68, u));
    col = mixRgb(col, cRose, smoothstep(0.68, 0.82, u));
    col = mixRgb(col, cAqua, smoothstep(0.82, 0.91, u));
    col = mixRgb(col, cCyan, smoothstep(0.91, 1.0, u));
    const offset = i * 4;
    pixels[offset] = Math.round(Math.max(0, Math.min(1, col[0])) * 255);
    pixels[offset + 1] = Math.round(Math.max(0, Math.min(1, col[1])) * 255);
    pixels[offset + 2] = Math.round(Math.max(0, Math.min(1, col[2])) * 255);
    pixels[offset + 3] = 255;
  }
  return pixels;
}

/** Creates a tiny 64x1 repeating bilinear 1D LUT texture for the VoiceOrb aurora spectrum. */
export function createVoiceOrbSpectrumLutTexture(
  engine: Engine,
  cCyan: readonly [number, number, number],
  cAzure: readonly [number, number, number],
  cViolet: readonly [number, number, number],
  cOrchid: readonly [number, number, number],
  cRose: readonly [number, number, number],
  cCore: readonly [number, number, number]
): Texture2D {
  const texture = new Texture2D(engine, VOICE_ORB_SPECTRUM_LUT_WIDTH, 1, TextureFormat.R8G8B8A8_UNorm, false, false);
  texture.isGCIgnored = true;
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Clamp;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(buildVoiceOrbSpectrumLutPixels(cCyan, cAzure, cViolet, cOrchid, cRose, cCore));
  return texture;
}

/**
 * Writes the column-major 3x3 rotation matrix matching GLSL `orbRotZ(rz) * orbRotX(rx) * orbRotY(ry)`
 * into the upper-left 3x3 of a Galacean column-major 4x4 `Matrix` (`e[15] = 1` signals precomputed).
 */
export function writeOrbRotationMatrixZXY(rz: number, rx: number, ry: number, out: Matrix): void {
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);

  const a00 = cz;
  const a01 = sz * cx;
  const a02 = sz * sx;
  const a10 = -sz;
  const a11 = cz * cx;
  const a12 = cz * sx;
  const a20 = 0;
  const a21 = -sx;
  const a22 = cx;

  const e = out.elements;
  e[0] = a00 * cy + a02 * sy;
  e[1] = a10 * cy + a12 * sy;
  e[2] = a20 * cy + a22 * sy;
  e[3] = 0;
  e[4] = a01;
  e[5] = a11;
  e[6] = a21;
  e[7] = 0;
  e[8] = -a00 * sy + a02 * cy;
  e[9] = -a10 * sy + a12 * cy;
  e[10] = -a20 * sy + a22 * cy;
  e[11] = 0;
  e[12] = 0;
  e[13] = 0;
  e[14] = 0;
  e[15] = 1;
}

export interface SeedWorldVoiceOrbFrameUniformCache {
  readonly rotBase: Matrix;
  readonly rotInner: Matrix;
  readonly rotMid: Matrix;
  readonly rotOuter: Matrix;
  readonly framePhase2: Vector4;
  readonly framePhase3: Vector4;
  readonly frameTrig0: Vector4;
  readonly frameTrig1: Vector4;
}

/** Allocates reusable math containers so per-frame VoiceOrb uniform updates allocate zero heap objects. */
export function createSeedWorldVoiceOrbFrameUniformCache(): SeedWorldVoiceOrbFrameUniformCache {
  return {
    rotBase: new Matrix(),
    rotInner: new Matrix(),
    rotMid: new Matrix(),
    rotOuter: new Matrix(),
    framePhase2: new Vector4(),
    framePhase3: new Vector4(),
    frameTrig0: new Vector4(),
    frameTrig1: new Vector4()
  };
}

/**
 * Precomputes frame-constant rotation matrices, wrapped FP16-safe ribbon phases, and trig vectors on CPU
 * so the VoiceOrb fragment shader pays zero per-pixel matrix/trig setup.
 */
export function syncSeedWorldVoiceOrbFrameUniforms(
  shaderData: ShaderData,
  phase: number,
  cache: SeedWorldVoiceOrbFrameUniformCache
): void {
  if (typeof shaderData.setMatrix !== "function" || typeof shaderData.setVector4 !== "function") return;
  const motion = typeof shaderData.getVector4 === "function" ? shaderData.getVector4("material_OrbMotion") : undefined;
  const flowSpeed = motion ? motion.x : 0.9;
  const sway = motion ? motion.y : 1.62;
  const t = phase * flowSpeed;

  writeOrbRotationMatrixZXY(
    -t * 0.48,
    0.22 + 0.14 * sway * Math.sin(t * 0.38),
    0.18 * sway * Math.cos(t * 0.33),
    cache.rotBase
  );
  writeOrbRotationMatrixZXY(
    t * 0.45 + 0.5,
    0.58 + 0.24 * sway * Math.sin(t * 0.52 + 0.7),
    -0.38 * sway * Math.cos(t * 0.44),
    cache.rotInner
  );
  writeOrbRotationMatrixZXY(
    -t * 0.56 + 1.8,
    -0.42 + 0.22 * sway * Math.cos(t * 0.46 + 1.5),
    0.32 * sway * Math.sin(t * 0.39 + 0.4),
    cache.rotMid
  );
  writeOrbRotationMatrixZXY(
    -t * 0.38 - 0.9,
    0.34 + 0.2 * sway * Math.sin(t * 0.41 + 2.4),
    -0.26 * sway * Math.cos(t * 0.35 + 1.1),
    cache.rotOuter
  );

  const tIn = t * 0.85;
  const tMid = -t * 0.75;
  const tOut = t * 0.68;
  cache.framePhase2.set(wrapRadians(tIn), wrapRadians(tMid), wrapRadians(tOut), 0);
  cache.framePhase3.set(wrapRadians(-0.8 * tIn), wrapRadians(-0.8 * tMid), wrapRadians(-0.8 * tOut), 0);
  cache.frameTrig0.set(
    Math.sin(tIn * 0.7),
    Math.cos(tIn * 0.7),
    Math.sin(tMid * 0.7),
    Math.cos(tMid * 0.7)
  );
  const auroraPhase = 1.85 + 0.45 * Math.sin(t * 0.35);
  cache.frameTrig1.set(
    Math.sin(tOut * 0.7),
    Math.cos(tOut * 0.7),
    Math.cos(auroraPhase),
    -Math.sin(auroraPhase)
  );

  shaderData.setMatrix("material_OrbRotBase", cache.rotBase);
  shaderData.setMatrix("material_OrbRotInner", cache.rotInner);
  shaderData.setMatrix("material_OrbRotMid", cache.rotMid);
  shaderData.setMatrix("material_OrbRotOuter", cache.rotOuter);
  shaderData.setVector4("material_OrbFramePhase2", cache.framePhase2);
  shaderData.setVector4("material_OrbFramePhase3", cache.framePhase3);
  shaderData.setVector4("material_OrbFrameTrig0", cache.frameTrig0);
  shaderData.setVector4("material_OrbFrameTrig1", cache.frameTrig1);
}

/** Registers voice-HUD Shader sources before startup variant warmup. */
export function registerSeedWorldVoiceHudStartupShaders(): readonly string[] {
  if (!Shader.find(SEED_WORLD_LIQUID_GLASS_SHADER_NAME)) Shader.create(seedWorldLiquidGlassShaderSource);
  if (!Shader.find(SEED_WORLD_VOICE_ORB_SHADER_NAME)) Shader.create(seedWorldVoiceOrbShaderSource);
  if (!Shader.find(SEED_WORLD_WORKING_TEXT_SHADER_NAME)) Shader.create(seedWorldWorkingTextShaderSource);
  return Object.freeze([
    SEED_WORLD_LIQUID_GLASS_SHADER_NAME,
    SEED_WORLD_VOICE_ORB_SHADER_NAME,
    SEED_WORLD_WORKING_TEXT_SHADER_NAME
  ]);
}
