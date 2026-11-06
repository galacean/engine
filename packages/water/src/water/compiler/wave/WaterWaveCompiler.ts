/** Deterministic WaterWaveAsset compiler shared by CPU queries and GPU materials. */
import {
  WATER_WAVE_COMPILER_VERSION,
  WATER_WAVE_EPSILON,
  WATER_WAVE_GRAVITY,
  WATER_WAVE_MAX_HORIZONTAL_AMPLITUDE_RATIO,
  WATER_WAVE_PACKED_FLOATS_PER_WAVE,
  WATER_WAVE_PACKED_OFFSET,
  WATER_WAVE_SHADER_SLOT_COUNTS,
  WATER_WAVE_TWO_PI
} from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterWaveDiagnosticCode, WaterWaveDiagnosticSeverity } from "../../authoring/wave/enums/WaterWaveDiagnostic";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type {
  GerstnerWaveLayerConfig,
  WaterWaveAssetV1,
  WaterWaveDiagnostic
} from "../../authoring/wave/WaterWaveTypes";
import { RiverReadonlyFloat32Buffer } from "../shared/ReadonlyNumericBuffer";
import { WaterBufferOwnership } from "../shared/WaterBufferOwnership";
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
    // CPU queries, GPU uniforms, cache identity, and browser/Node compilation
    // must consume the same numeric contract. Transcendental functions are
    // allowed to differ by a few low bits across JS engines, so freeze every
    // compiled wave fact to the Float32 precision actually uploaded to WebGL.
    const amplitude = Math.fround(candidate.amplitude);
    const waveNumber = Math.fround(candidate.waveNumber);
    const steepness = Math.fround(candidate.steepness);
    const authoredHorizontalAmplitude =
      amplitude <= WATER_WAVE_EPSILON
        ? 0
        : Math.min(
            steepness / Math.max(waveNumber * activeCount, WATER_WAVE_EPSILON),
            amplitude * WATER_WAVE_MAX_HORIZONTAL_AMPLITUDE_RATIO
          );
    return Object.freeze({
      sourceIndex: candidate.sourceIndex,
      directionX: Math.fround(candidate.directionX),
      directionZ: Math.fround(candidate.directionZ),
      amplitude,
      wavelength: Math.fround(candidate.wavelength),
      waveNumber,
      angularFrequency: Math.fround(candidate.angularFrequency),
      steepness,
      phase: Math.fround(candidate.phase),
      energy: Math.fround(candidate.energy),
      horizontalAmplitude: Math.fround(authoredHorizontalAmplitude)
    });
  });
  return Object.freeze(waves);
}

function createExactGerstnerWaveCandidates(
  layers: readonly GerstnerWaveLayerConfig[]
): readonly GerstnerWaveCandidate[] {
  return Object.freeze(
    layers.map((layer, sourceIndex) => {
      const waveNumber = WATER_WAVE_TWO_PI / layer.wavelength;
      return Object.freeze({
        sourceIndex,
        directionX: Math.cos(layer.directionAngle),
        directionZ: Math.sin(layer.directionAngle),
        amplitude: layer.amplitude,
        wavelength: layer.wavelength,
        waveNumber,
        angularFrequency: Math.sqrt(WATER_WAVE_GRAVITY * waveNumber),
        steepness: layer.steepness,
        phase: layer.phase,
        energy: layer.amplitude * layer.amplitude
      });
    })
  );
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

/** Hashes only the authored facts that can affect the compiled physical wave set. */
function effectiveWaveSource(asset: WaterWaveAssetV1): unknown {
  if (asset.model === WaterWaveModel.None || !asset.layers) return asset;
  return Object.freeze({
    schemaVersion: asset.schemaVersion,
    model: asset.model,
    layers: asset.layers
  });
}

function compileNone(asset: WaterWaveAssetV1, diagnostics: readonly WaterWaveDiagnostic[]): CompiledWaterWaveSet {
  const waves: readonly CompiledGerstnerWave[] = Object.freeze([]);
  return Object.freeze({
    model: WaterWaveModel.None,
    activeWaveCount: 0,
    shaderWaveCount: 0,
    waves,
    packedShaderData: new RiverReadonlyFloat32Buffer([]),
    maxVerticalDisplacement: 0,
    maxHorizontalDisplacement: 0,
    sourceHash: hashStableValue({
      compilerVersion: WATER_WAVE_COMPILER_VERSION,
      asset: effectiveWaveSource(asset),
      waves
    }),
    diagnostics
  });
}

function compilePhysicalWaterWaveAssetWithinLimit(
  value: unknown,
  activeBudget: number,
  rejectExactLayerOverflow: boolean
): CompiledWaterWaveSet {
  const validation = validateWaterWaveAsset(value);
  const diagnostics = validation.diagnostics.slice();
  if (!validation.valid || !validation.value) {
    throw new WaterWaveCompilationError(Object.freeze(diagnostics));
  }
  const asset = validation.value;
  if (asset.model === WaterWaveModel.None) {
    return compileNone(asset, Object.freeze(diagnostics));
  }
  if (rejectExactLayerOverflow && asset.layers && asset.layers.length > activeBudget) {
    diagnostics.push({
      code: WaterWaveDiagnosticCode.PhysicalWaveBudgetExceeded,
      severity: WaterWaveDiagnosticSeverity.Error,
      path: "$.layers",
      message: `The physical Water compiler supports at most ${activeBudget} exact layers; received ${asset.layers.length}.`
    });
    throw new WaterWaveCompilationError(Object.freeze(diagnostics));
  }
  const candidates = asset.layers
    ? createExactGerstnerWaveCandidates(asset.layers)
    : generateGerstnerWaveCandidates(asset.generator);
  const activeCount = Math.min(activeBudget, candidates.length);
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
    activeWaveCount: waves.length,
    shaderWaveCount,
    waves,
    packedShaderData: new RiverReadonlyFloat32Buffer(packed, WaterBufferOwnership.Transfer),
    maxVerticalDisplacement,
    maxHorizontalDisplacement,
    sourceHash: hashStableValue({
      compilerVersion: WATER_WAVE_COMPILER_VERSION,
      asset: effectiveWaveSource(asset),
      shaderWaveCount,
      waves
    }),
    diagnostics: frozenDiagnostics
  });
}

/**
 * Compiles one shader-supported physical wave set independent of presentation
 * quality. Explicit layers are authoritative and fail closed when they exceed
 * the fixed shader capacity; generators deterministically select that capacity.
 */
export function compilePhysicalWaterWaveAsset(value: unknown): CompiledWaterWaveSet {
  return compilePhysicalWaterWaveAssetWithinLimit(value, WATER_WAVE_SHADER_SLOT_COUNTS.at(-1)!, true);
}
