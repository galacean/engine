import { SafeLoopArray } from "../utils/SafeLoopArray";
import { PostProcessEffect } from "./PostProcessEffect";

export class PostProcess {
  private _isActive = true;
  private _effects = new SafeLoopArray<PostProcessEffect>();

  /**
   * Whether to activate current post process.
   */
  get isActive(): boolean {
    return this._isActive;
  }

  set isActive(value: boolean) {
    this._isActive = value;
  }

  /**
   * Get the post process effect list.
   */
  get effects(): ReadonlyArray<PostProcessEffect> {
    return this._effects.getArray();
  }

  /**
   * Get post process effect which match the type.
   * @param type - The type of the post process effect
   * @returns The first post process effect which match type
   */
  getEffect(type: typeof PostProcessEffect): PostProcessEffect | null {
    const effects = this._effects;
    for (let i = 0, length = effects.length; i < length; i++) {
      const effect = effects[i];
      if (effect instanceof type) {
        return effect;
      }
    }
    return null;
  }

  /**
   * Get post process effects which match the type.
   * @param type - The type of the post process effect
   * @param results - The effects which match type
   * @returns The effects which match type
   */
  getEffects(type: typeof PostProcessEffect, results: PostProcessEffect[]): PostProcessEffect[] {
    results.length = 0;
    const effects = this._effects;
    for (let i = 0, n = effects.length; i < n; i++) {
      const effect = effects[i];
      if (effect instanceof type) {
        results.push(effect);
      }
    }
    return results;
  }

  /**
   * Add post process effect.
   * @param value - The post process effect want to be added
   */
  addEffect(value: PostProcessEffect): void;

  /**
   * Add post process at specified index.
   * @param index - Specified index
   * @param value - The post process effect want to be added
   */
  addEffect(index: number, value: PostProcessEffect): void;

  addEffect(indexOrValue: number | PostProcessEffect, value?: PostProcessEffect): void {}

  /**
   * Remove post process effect.
   * @param value - The post process effect want to be removed
   */
  removeEffect(value: PostProcessEffect): void {}
}
