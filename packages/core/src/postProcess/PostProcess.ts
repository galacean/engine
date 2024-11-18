import { Logger } from "../base";
import { ignoreClone } from "../clone/CloneManager";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { Layer } from "../Layer";
import { PostProcessEffect } from "./PostProcessEffect";

/**
 * PostProcess can be used to apply effects such as Bloom and Tonemapping to the Scene or Colliders.
 */
export class PostProcess extends Component {
  /**
   * A value which determines which PostProcess is being used when PostProcess have an equal amount of influence on the Scene.
   * @remarks
   * PostProcess with a higher priority will override lower ones.
   */
  priority = 0;

  /**
   * The layer to which the PostProcess belongs.
   */
  layer = Layer.Layer0;

  /**
   * Whether the PostProcess is global.
   * @remarks
   * Specifies whether to apply the PostProcess to the entire Scene or in Colliders.
   */
  readonly isGlobal = true;

  /**
   * @internal
   */
  @ignoreClone
  _effects: PostProcessEffect[] = [];

  constructor(entity: Entity) {
    super(entity);
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
    const effectFind = this.getEffect(type) as InstanceType<T>;

    if (effectFind) {
      effects.splice(effects.indexOf(effectFind), 1);
      effectFind._setActive(false);
      return effectFind;
    }
  }

  /**
   * @inheritdoc
   */
  override _onEnable() {
    this.scene._postProcessManager._addPostProcess(this);
    this._setActiveEffects(true);
  }

  /**
   * @inheritdoc
   */
  override _onDisable() {
    this.scene._postProcessManager._removePostProcess(this);
    this._setActiveEffects(false);
  }

  private _setActiveEffects(isActive: boolean): void {
    const effects = this._effects;
    for (let i = 0, length = effects.length; i < length; i++) {
      effects[i]._setActive(isActive);
    }
  }

  /**
   * @internal
   */
  _cloneTo(target: PostProcess, srcRoot: Entity, targetRoot: Entity): void {
    const effects = this._effects;
    for (let i = 0; i < effects.length; i++) {
      target.addEffect(<typeof PostProcessEffect>effects[i].constructor);
    }
  }
}
