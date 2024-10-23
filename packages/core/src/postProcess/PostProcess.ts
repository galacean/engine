import { Logger } from "../base";
import { deepClone } from "../clone/CloneManager";
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

  @deepClone
  private _effects: PostProcessEffect[] = [];

  get effects(): PostProcessEffect[] {
    return this._effects;
  }

  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * @inheritdoc
   */
  override _onEnable() {
    this.scene._postProcessManager.addPostProcess(this);
  }

  /**
   * @inheritdoc
   */
  override _onDisable() {
    this.scene._postProcessManager.removePostProcess(this);
  }

  /**
   * Get the PostProcessEffect by type.
   * @param type - The type of PostProcessEffect
   * @returns The PostProcessEffect found
   */
  getEffect(type: typeof PostProcessEffect): PostProcessEffect {
    const effects = this._effects;
    const length = effects.length;

    for (let i = 0; i < length; i++) {
      const effect = effects[i];
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
  addEffect(type: typeof PostProcessEffect): PostProcessEffect {
    if (this.getEffect(type)) {
      Logger.error(`effect "${type.name}" already exists in the PostProcess.`);
      return;
    }

    const effect = new type(this);
    this._effects.push(effect);
    return effect;
  }

  /**
   * Remove a PostProcessEffect from the PostProcess.
   * @param type - The type of PostProcessEffect
   * @returns The PostProcessEffect removed
   */
  removeEffect(type: typeof PostProcessEffect): PostProcessEffect {
    const effects = this._effects;
    const effectFind = this.getEffect(type);

    if (effectFind) {
      effects.splice(effects.indexOf(effectFind), 1);
      return effectFind;
    }
  }
}
