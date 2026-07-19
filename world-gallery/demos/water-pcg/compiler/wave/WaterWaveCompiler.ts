/** Deterministic WaterWaveAsset compiler shared by CPU queries and GPU materials. */
import {
  WATER_WAVE_ACTIVE_COUNT_BY_QUALITY,
  WATER_WAVE_COMPILER_VERSION,
  WATER_WAVE_EPSILON,
  WATER_WAVE_MAX_HORIZONTAL_AMPLITUDE_RATIO,
  WATER_WAVE_PACKED_FLOATS_PER_WAVE,
  WATER_WAVE_PACKED_OFFSET,
  WATER_WAVE_SHADER_SLOT_COUNTS
} from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterWaveDiagnosticCode, WaterWaveDiagnosticSeverity } from "../../authoring/wave/enums/WaterWaveDiagnostic";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { WaterWaveAssetV1, WaterWaveDiagnostic } from "../../authoring/wave/WaterWaveTypes";
import { RiverReadonlyFloat32Buffer } from "../shared/ReadonlyNumericBuffer";
import { hashStableValue } from "../shared/determinism";
import { generateGerstnerWaveCandidates } from "./GerstnerWaveGenerator";
import type { CompiledGerstnerWave, CompiledWaterWaveSet, GerstnerWaveCandidate } from "./CompiledWaterWaveTypes";
import { validateWaterWaveAsset } from "./WaterWaveValidator";

export class WaterWaveCompilationError extends Error {
  constructor(readonly diagnostics: readonly WaterWaveDiagnostic[]) {
    super(diagnostics.map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`).join("\n"));
    this.name = "WaterWaveCompilationError";
  }
}

function isWaterQualityTier(value: unknown): value is WaterQualityTier {
  return value === WaterQualityTier.Low || value === WaterQualityTier.Medium || value === WaterQualityTier.High;
}

function stableEnergyOrder(a: GerstnerWaveCandidate, b: GerstnerWaveCandidate): number {
  const energyDifference = b.energy - a.energy;
  return Math.abs(energyDifference) > WATER_WAVE_EPSILON ? energyDifference : a.sourceIndex - b.sourceIndex;
}

function compileWaves(
  candidates: readonly GerstnerWaveCandidate[],
  activeCount: number
): readonly CompiledGerstnerWave[] {
  const selected = candidates.slice().sort(stableEnergyOrder).slice(0, activeCount);
  const waves = selected.map((candidate) => {
    const authoredHorizontalAmplitude =
      candidate.amplitude <= WATER_WAVE_EPSILON
        ? 0
        : Math.min(
            candidate.steepness / Math.max(candidate.waveNumber * activeCount, WATER_WAVE_EPSILON),
            candidate.amplitude * WATER_WAVE_MAX_HORIZONTAL_AMPLITUDE_RATIO
          );
    return Object.freeze({ ...candidate, horizontalAmplitude: authoredHorizontalAmplitude });
  });
  return Object.freeze(waves);
}

function packWaves(waves: readonly CompiledGerstnerWave[]): Float32Array {
  const packed = new Float32Array(waves.length * WATER_WAVE_PACKED_FLOATS_PER_WAVE);
  for (let index = 0; index < waves.length; index++) {
    const wave = waves[index];
    const offset = index * WATER_WAVE_PACKED_FLOATS_PER_WAVE;
    packed[offset + WATER_WAVE_PACKED_OFFSET.directionX] = wave.directionX;
    packed[offset + WATER_WAVE_PACKED_OFFSET.directionZ] = wave.directionZ;
    packed[offset + WATER_WAVE_PACKED_OFFSET.amplitude] = wave.amplitude;
    packed[offset + WATER_WAVE_PACKED_OFFSET.waveNumber] = wave.waveNumber;
    packed[offset + WATER_WAVE_PACKED_OFFSET.angularFrequency] = wave.angularFrequency;
    packed[offset + WATER_WAVE_PACKED_OFFSET.horizontalAmplitude] = wave.horizontalAmplitude;
    packed[offset + WATER_WAVE_PACKED_OFFSET.phase] = wave.phase;
    packed[offset + WATER_WAVE_PACKED_OFFSET.energy] = wave.energy;
  }
  return packed;
}

function resolveShaderWaveCount(activeWaveCount: number): number {
  if (activeWaveCount === 0) return 0;
  return (
    WATER_WAVE_SHADER_SLOT_COUNTS.find((slotCount) => slotCount >= activeWaveCount) ??
    WATER_WAVE_SHADER_SLOT_COUNTS.at(-1)!
  );
}

function compileNone(
  asset: WaterWaveAssetV1,
  quality: WaterQualityTier,
  diagnostics: readonly WaterWaveDiagnostic[]
): CompiledWaterWaveSet {
  const waves: readonly CompiledGerstnerWave[] = Object.freeze([]);
  return Object.freeze({
    model: WaterWaveModel.None,
    quality,
    activeWaveCount: 0,
    shaderWaveCount: 0,
    waves,
    packedShaderData: new RiverReadonlyFloat32Buffer([]),
    maxVerticalDisplacement: 0,
    maxHorizontalDisplacement: 0,
    sourceHash: hashStableValue({ compilerVersion: WATER_WAVE_COMPILER_VERSION, asset, quality, waves }),
    diagnostics
  });
}

export function compileWaterWaveAsset(value: unknown, quality: WaterQualityTier): CompiledWaterWaveSet {
  const validation = validateWaterWaveAsset(value);
  const diagnostics = validation.diagnostics.slice();
  if (!isWaterQualityTier(quality)) {
    diagnostics.push({
      code: WaterWaveDiagnosticCode.UnsupportedQuality,
      severity: WaterWaveDiagnosticSeverity.Error,
      path: "$.quality",
      message: "Expected low, medium, or high water quality."
    });
  }
  if (!validation.valid || !validation.value || !isWaterQualityTier(quality)) {
    throw new WaterWaveCompilationError(Object.freeze(diagnostics));
  }
  const asset = validation.value;
  if (asset.model === WaterWaveModel.None) return compileNone(asset, quality, Object.freeze(diagnostics));
  const candidates = generateGerstnerWaveCandidates(asset.generator);
  const activeCount = Math.min(WATER_WAVE_ACTIVE_COUNT_BY_QUALITY[quality], candidates.length);
  const waves = compileWaves(candidates, activeCount);
  const shaderWaveCount = resolveShaderWaveCount(waves.length);
  if (shaderWaveCount !== waves.length) {
    diagnostics.push({
      code: WaterWaveDiagnosticCode.ShaderVariantPadded,
      severity: WaterWaveDiagnosticSeverity.Warning,
      path: "$.generator.waveCount",
      message: `The ${waves.length}-wave result uses the fixed ${shaderWaveCount}-slot shader variant; unused slots are zero-filled.`
    });
  }
  const frozenDiagnostics = Object.freeze(diagnostics);
  const packed = packWaves(waves);
  let maxVerticalDisplacement = 0;
  let maxHorizontalDisplacement = 0;
  for (const wave of waves) {
    maxVerticalDisplacement += Math.abs(wave.amplitude);
    maxHorizontalDisplacement += Math.abs(wave.horizontalAmplitude);
  }
  return Object.freeze({
    model: WaterWaveModel.DirectionalGerstner,
    quality,
    activeWaveCount: waves.length,
    shaderWaveCount,
    waves,
    packedShaderData: new RiverReadonlyFloat32Buffer(packed),
    maxVerticalDisplacement,
    maxHorizontalDisplacement,
    sourceHash: hashStableValue({
      compilerVersion: WATER_WAVE_COMPILER_VERSION,
      asset,
      quality,
      shaderWaveCount,
      waves
    }),
    diagnostics: frozenDiagnostics
  });
}

export function getWaterWaveQualityBudget(quality: WaterQualityTier): number {
  return WATER_WAVE_ACTIVE_COUNT_BY_QUALITY[quality];
}
