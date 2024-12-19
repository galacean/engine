import { Logger } from "../base";
import { deepClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Layer } from "../Layer";
import { PostProcessEffect } from "./PostProcessEffect";

/**
 * Post Process component can be used for global or local post-processing.
 */
export class PostProcess extends Component {
  /**
   * The layer to which the PostProcess belongs.
   */
  layer = Layer.Layer0;

  /**
   * The outer distance to start blending from, only takes effect when the `isGlobal` is false.
   */
  blendDistance = 0;

  /** @internal */
  @deepClone
  _effects: PostProcessEffect[] = [];

  private _priority = 0;
  private _isGlobal = true;

  /**
   * Whether the PostProcess is global.
   * @remarks
   * Specifies whether to apply the PostProcess to the entire Scene or in Colliders.
   * Only support local PostProcess in physics enabled Scenes.
   */
  get isGlobal(): boolean {
    return this._isGlobal;
  }

  set isGlobal(value: boolean) {
    if (value !== this._isGlobal) {
      if (!value && !this.engine._physicsInitialized) {
        Logger.warn("Only support local PostProcess in physics enabled Scenes.");
        return;
      }

      this._isGlobal = value;
    }
  }

  /**
   * A value which determines which PostProcess is being used when PostProcess have an equal amount of influence on the Scene.
   * @remarks
   * PostProcess with a higher priority will override lower ones.
   */
  get priority(): number {
    return this._priority;
  }

  set priority(value: number) {
    this._priority = value;
    if (this.scene) {
      this.scene.postProcessManager._postProcessNeedSorting = true;
    }
  }

  /**
   * Get the PostProcessEffect by type.
   * @param type - The type of PostProcessEffect
   * @returns The PostProcessEffect found
   */
  getEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T> {
    const effects = this._effects;
    const length = effects.length;

    for (let i = 0; i < length; i++) {
      const effect = effects[i] as InstanceType<T>;
      if (effect instanceof type) {
        return effect;
      }
    }
  }

  /**
   * Add a PostProcessEffect to the PostProcess.
   * @remarks Only one effect of the same type can be added to the PostProcess.
   * @param type - The type of PostProcessEffect
   * @returns The PostProcessEffect added
   */
  addEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T> {
    if (this.getEffect(type)) {
      Logger.error(`effect "${type.name}" already exists in the PostProcess.`);
      return;
    }

    const effect = new type(this) as InstanceType<T>;
    this._effects.push(effect);
    effect._setActive(true);
    return effect;
  }

  /**
   * Remove a PostProcessEffect from the PostProcess.
   * @param type - The type of PostProcessEffect
   * @returns The PostProcessEffect removed
   */
  removeEffect<T extends typeof PostProcessEffect>(type: T): InstanceType<T> {
    const effects = this._effects;
    const length = effects.length;

    for (let i = 0; i < length; i++) {
      const effect = effects[i] as InstanceType<T>;
      if (effect instanceof type) {
        effects.splice(i, 1);
        effect._setActive(false);

        return effect;
      }
    }
  }

  /**
   * @inheritdoc
   */
  override _onEnableInScene() {
    if (this._destroyed) {
      return;
    }
    this.scene.postProcessManager._addPostProcess(this);
    this._setActiveEffects(true);
  }

  /**
   * @inheritdoc
   */
  override _onDisableInScene() {
    if (this._destroyed) {
      return;
    }
    this.scene.postProcessManager._removePostProcess(this);
    this._setActiveEffects(false);
  }

  private _setActiveEffects(isActive: boolean): void {
    const effects = this._effects;
    for (let i = 0, length = effects.length; i < length; i++) {
      effects[i]._setActive(isActive);
    }
  }
}
