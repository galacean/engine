import { Engine } from "../Engine";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { SafeLoopArray } from "../utils/SafeLoopArray";
import { PostProcessEffect } from "./PostProcessEffect";
import { PostProcessManager } from "./PostProcessManager";

export class PostProcessPass extends PipelinePass {
  private _isActive = true;
  private _effects = new SafeLoopArray<PostProcessEffect>();

  /** The name of pass. */
  name: string;

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
   * Create a post process pass.
   * @param engine - The engine the pass belongs to
   * @param name - The pass name if need
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
  }

  override onRender(context: RenderContext): void {
    const effects = this._effects.getLoopArray();
    for (let i = 0, length = effects.length; i < length; i++) {
      const effect = effects[i];
      if (effect.enabled) {
        // Should blit to resolve the MSAA
        context.srcRT._blitRenderTarget();
        context.destRT = PostProcessManager._getTransformRT();
        effect.onRender(context);
        context.srcRT = context.destRT;
      }
    }
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
   * @param effect - The post process effect want to be added
   */
  addEffect(effect: PostProcessEffect): void;

  /**
   * Add post process at specified index.
   * @param indexOrEffect - Specified index
   * @param effect - The post process effect want to be added
   */
  addEffect(index: number, effect: PostProcessEffect): void;

  addEffect(indexOrEffect: number | PostProcessEffect, effect?: PostProcessEffect): void {
    const effects = this._effects;
    let index: number;

    if (typeof indexOrEffect === "number") {
      if (indexOrEffect < 0 || indexOrEffect > effects.length) {
        throw "The index is out of range.";
      }
      index = indexOrEffect;
    } else {
      index = effects.length;
      effect = indexOrEffect;
    }

    const currentIndex = effects.indexOf(effect);
    if (currentIndex !== index) {
      if (effect.engine !== this.engine) {
        throw "The post process effect is not belong to this engine.";
      }
      if (currentIndex !== -1) {
        effects.removeByIndex(currentIndex);
      }
      effects.add(index, effect);
    }
  }

  /**
   * Remove post process effect.
   * @param effect - The post process effect want to be removed
   */
  removeEffect(effect: PostProcessEffect): void {
    const effects = this._effects;
    const index = effects.indexOf(effect);
    if (index !== -1) {
      effects.removeByIndex(index);
    }
  }
}
