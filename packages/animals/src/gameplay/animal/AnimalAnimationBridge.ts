import { AnimationClip, Animator, AnimatorState, Script, StateMachineScript } from "@galacean/engine";
import type { AnimalAnimationState as AnimalState } from "./AnimalSpeciesAsset";

/** Queue sink called inside the Animator; implementations must defer mutations until lateUpdate. */
export type AnimalAnimationSink = (kind: "enter" | "marker", state: AnimalState, marker?: string) => void;

/** Native state-entry bridge; deliberately has no per-frame state callback. */
export class AnimalStateEvents extends StateMachineScript {
  /** Module-owned sink assigned when constructing the state graph. */
  sink!: AnimalAnimationSink;

  /** Enqueue the entered native state without changing the Animator during its update. */
  override onStateEnter(_animator: Animator, state: AnimatorState): void {
    this.sink("enter", state.name as AnimalState);
  }
}

/** Animation markers bind to scripts on the Animator's own Entity. */
export class AnimalAnimationBridge extends Script {
  /** Module-owned sink assigned before any clip can play. */
  sink!: AnimalAnimationSink;

  /** Queue an authored marker; its runtime action identity is resolved by the owning module. */
  animalMarker(parameter: { state: AnimalState; marker: string }): void {
    this.sink("marker", parameter.state, parameter.marker);
  }
}

/**
 * Own only event/binding metadata while borrowing immutable source curves.
 * @param source Shared model animation; its events and curves remain unchanged.
 * @param role Instance controller's semantic state name, including aliases of the same clip.
 * @returns Instance-owned clip with a role-specific completion marker; caller must destroy it.
 */
export function createAnimalAnimationClip(source: AnimationClip, role: AnimalState): AnimationClip {
  const clip = new AnimationClip(source.name);
  for (const binding of source.curveBindings) {
    if (!binding.curve) throw new Error("Animal animation binding requires a curve");
    if (binding.getProperty) {
      clip.addCurveBinding(
        binding.relativePath,
        binding.type,
        binding.typeIndex,
        binding.property,
        binding.getProperty,
        binding.curve
      );
    } else {
      clip.addCurveBinding(binding.relativePath, binding.type, binding.typeIndex, binding.property, binding.curve);
    }
  }
  for (const event of source.events) clip.addEvent(event);
  clip.addEvent("animalMarker", Math.max(0, clip.length - 0.04), { state: role, marker: "finished" });
  return clip;
}
