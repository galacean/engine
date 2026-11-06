import { containsWaterBounds } from "../body/WaterBodyRuntime";
import {
  WaterLocalModifierChannel,
  createWaterLocalFieldSample,
  resetWaterLocalFieldSample,
  type WaterLocalFieldProvider,
  type WaterLocalFieldSample
} from "./WaterLocalFieldProvider";
import {
  WaterLocalModifierBlendMode,
  type WaterLocalModifier,
  type WaterLocalModifierBinding
} from "./WaterLocalModifier";

const ALL_LOCAL_CHANNELS =
  WaterLocalModifierChannel.DisplacementY |
  WaterLocalModifierChannel.DisplacementXZ |
  WaterLocalModifierChannel.CurrentLarge |
  WaterLocalModifierChannel.CurrentRipple |
  WaterLocalModifierChannel.FoamSource |
  WaterLocalModifierChannel.SimulationMask;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function vectorMagnitudeSquared(x: number, z: number): number {
  return x * x + z * z;
}

function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateModifier(modifier: WaterLocalModifier, provider: WaterLocalFieldProvider): void {
  const bounds = modifier.bounds;
  if (!modifier.id || !modifier.bodyId) throw new Error("Water local modifier id and body id are required.");
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxZ) ||
    bounds.minX > bounds.maxX ||
    bounds.minZ > bounds.maxZ
  ) {
    throw new Error("Water local modifier bounds must be finite and ordered.");
  }
  if (!Number.isFinite(modifier.priority)) throw new Error("Water local modifier priority must be finite.");
  if ((modifier.channels & ALL_LOCAL_CHANNELS) === 0 || (modifier.channels & ~ALL_LOCAL_CHANNELS) !== 0) {
    throw new Error("Water local modifier channels are invalid.");
  }
  if ((modifier.channels & ~provider.channels) !== 0) {
    throw new Error("Water local modifier requests channels that its provider does not expose.");
  }
}

function blendAdd(channels: number, source: WaterLocalFieldSample, target: WaterLocalFieldSample): void {
  if ((channels & WaterLocalModifierChannel.DisplacementY) !== 0) {
    target.displacementY += source.displacementY;
    target.surfaceVelocityY += source.surfaceVelocityY;
    target.gradientX += source.gradientX;
    target.gradientZ += source.gradientZ;
  }
  if ((channels & WaterLocalModifierChannel.DisplacementXZ) !== 0) {
    target.displacementX += source.displacementX;
    target.displacementZ += source.displacementZ;
  }
  if ((channels & WaterLocalModifierChannel.CurrentLarge) !== 0) {
    target.currentLargeX += source.currentLargeX;
    target.currentLargeZ += source.currentLargeZ;
  }
  if ((channels & WaterLocalModifierChannel.CurrentRipple) !== 0) {
    target.currentRippleX += source.currentRippleX;
    target.currentRippleZ += source.currentRippleZ;
  }
  if ((channels & WaterLocalModifierChannel.FoamSource) !== 0) {
    target.foamSource = clamp01(target.foamSource + source.foamSource);
  }
  if ((channels & WaterLocalModifierChannel.SimulationMask) !== 0) {
    target.simulationMask *= clamp01(source.simulationMask);
  }
}

function blendMax(channels: number, source: WaterLocalFieldSample, target: WaterLocalFieldSample): void {
  if (
    (channels & WaterLocalModifierChannel.DisplacementY) !== 0 &&
    Math.abs(source.displacementY) > Math.abs(target.displacementY)
  ) {
    target.displacementY = source.displacementY;
    target.surfaceVelocityY = source.surfaceVelocityY;
    target.gradientX = source.gradientX;
    target.gradientZ = source.gradientZ;
  }
  if (
    (channels & WaterLocalModifierChannel.DisplacementXZ) !== 0 &&
    vectorMagnitudeSquared(source.displacementX, source.displacementZ) >
      vectorMagnitudeSquared(target.displacementX, target.displacementZ)
  ) {
    target.displacementX = source.displacementX;
    target.displacementZ = source.displacementZ;
  }
  if (
    (channels & WaterLocalModifierChannel.CurrentLarge) !== 0 &&
    vectorMagnitudeSquared(source.currentLargeX, source.currentLargeZ) >
      vectorMagnitudeSquared(target.currentLargeX, target.currentLargeZ)
  ) {
    target.currentLargeX = source.currentLargeX;
    target.currentLargeZ = source.currentLargeZ;
  }
  if (
    (channels & WaterLocalModifierChannel.CurrentRipple) !== 0 &&
    vectorMagnitudeSquared(source.currentRippleX, source.currentRippleZ) >
      vectorMagnitudeSquared(target.currentRippleX, target.currentRippleZ)
  ) {
    target.currentRippleX = source.currentRippleX;
    target.currentRippleZ = source.currentRippleZ;
  }
  if ((channels & WaterLocalModifierChannel.FoamSource) !== 0) {
    target.foamSource = Math.max(target.foamSource, clamp01(source.foamSource));
  }
  if ((channels & WaterLocalModifierChannel.SimulationMask) !== 0) {
    target.simulationMask = Math.min(target.simulationMask, clamp01(source.simulationMask));
  }
}

function blendOverride(channels: number, source: WaterLocalFieldSample, target: WaterLocalFieldSample): void {
  if ((channels & WaterLocalModifierChannel.DisplacementY) !== 0) {
    target.displacementY = source.displacementY;
    target.surfaceVelocityY = source.surfaceVelocityY;
    target.gradientX = source.gradientX;
    target.gradientZ = source.gradientZ;
  }
  if ((channels & WaterLocalModifierChannel.DisplacementXZ) !== 0) {
    target.displacementX = source.displacementX;
    target.displacementZ = source.displacementZ;
  }
  if ((channels & WaterLocalModifierChannel.CurrentLarge) !== 0) {
    target.currentLargeX = source.currentLargeX;
    target.currentLargeZ = source.currentLargeZ;
  }
  if ((channels & WaterLocalModifierChannel.CurrentRipple) !== 0) {
    target.currentRippleX = source.currentRippleX;
    target.currentRippleZ = source.currentRippleZ;
  }
  if ((channels & WaterLocalModifierChannel.FoamSource) !== 0) target.foamSource = clamp01(source.foamSource);
  if ((channels & WaterLocalModifierChannel.SimulationMask) !== 0) {
    target.simulationMask = clamp01(source.simulationMask);
  }
}

/** Ordered body-local field composition. Sampling never allocates or mutates provider-owned storage. */
export class WaterLocalFieldComposer implements WaterLocalFieldProvider {
  readonly channels = ALL_LOCAL_CHANNELS;

  private readonly _bindings: WaterLocalModifierBinding[] = [];
  private readonly _scratch = createWaterLocalFieldSample();

  constructor(readonly bodyId: string) {
    if (!bodyId) throw new Error("Water local field composer requires a body id.");
  }

  get modifierCount(): number {
    return this._bindings.length;
  }

  register(modifier: WaterLocalModifier, provider: WaterLocalFieldProvider): void {
    if (modifier.bodyId !== this.bodyId) throw new Error("Water local modifier belongs to a different body.");
    if (this._bindings.some((binding) => binding.modifier.id === modifier.id)) {
      throw new Error(`Water local modifier id is already registered: ${modifier.id}.`);
    }
    validateModifier(modifier, provider);
    this._bindings.push({ modifier, provider });
    this._bindings.sort(
      (left, right) =>
        left.modifier.priority - right.modifier.priority || compareStableIds(left.modifier.id, right.modifier.id)
    );
  }

  unregister(modifierId: string): boolean {
    const index = this._bindings.findIndex((binding) => binding.modifier.id === modifierId);
    if (index < 0) return false;
    this._bindings.splice(index, 1);
    return true;
  }

  sampleLocalField(worldX: number, worldZ: number, outSample: WaterLocalFieldSample): boolean {
    resetWaterLocalFieldSample(outSample);
    let hit = false;
    for (const binding of this._bindings) {
      const { modifier, provider } = binding;
      if (!containsWaterBounds(modifier.bounds, worldX, worldZ)) continue;
      const scratch = this._scratch;
      resetWaterLocalFieldSample(scratch);
      if (!provider.sampleLocalField(worldX, worldZ, scratch)) continue;
      hit = true;
      switch (modifier.blendMode) {
        case WaterLocalModifierBlendMode.Add:
          blendAdd(modifier.channels, scratch, outSample);
          break;
        case WaterLocalModifierBlendMode.Max:
          blendMax(modifier.channels, scratch, outSample);
          break;
        case WaterLocalModifierBlendMode.Override:
          blendOverride(modifier.channels, scratch, outSample);
          break;
      }
    }
    return hit;
  }
}
