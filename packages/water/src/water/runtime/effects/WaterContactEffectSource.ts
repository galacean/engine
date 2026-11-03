import type { WaterContactEffectKind } from "../../authoring/effects/WaterContactEffectsLook";

/** Authored contact region. Adapters may derive these from geometry; they are not collision events. */
export interface WaterContactEffectSource {
  readonly id: string;
  readonly kind: WaterContactEffectKind;
  readonly samplePosition: readonly [number, number, number];
  readonly offset: readonly [number, number, number];
  readonly width: number;
  readonly seed: number;
}

/** Bounded response to measured local velocity, never an authored global flow-speed substitute. */
export function waterContactEffectActivation(speed: number, depth: number): number {
  if (!Number.isFinite(speed) || !Number.isFinite(depth) || depth <= 0 || speed <= 0) return 0;
  const x = Math.min(speed / 1.5, 1);
  return x * x * (3 - 2 * x);
}
