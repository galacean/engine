import { PostProcess } from "./PostProcess";
import { PostProcessEffectParameter } from "./PostProcessEffectParameter";

/**
 * The base class for post process effect.
 */
export class PostProcessEffect {
  private _enabled = true;
  private _parameters: PostProcessEffectParameter<any>[] = [];
  private _parameterInitialized = false;

  /**
   * Indicates whether the post process effect is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value === this._enabled) {
      return;
    }

    this._enabled = value;
  }

  /**
   * Create a post process effect.
   * @remarks
   * postProcess can be null when the effect is just used to blend data, and will not post message to the post process manager.
   * @param postProcess - The post process being used
   */
  constructor(public postProcess?: PostProcess) {}

  /**
   * Whether the post process effect is valid.
   * @remarks
   * This method can be overridden to control the effect's real validity.
   */
  isValid(): boolean {
    return this._enabled;
  }

  /**
   * Interpolates from the current effect to the end effect by an interpolation factor.
   * @param to - The end effect
   * @param factor - The interpolation factor in range [0,1]
   */
  lerp(to: PostProcessEffect, factor: number): void {
    const parameters = this._getParameters();
    const toParameters = to._getParameters();

    for (let i = 0, n = parameters.length; i < n; i++) {
      const targetParameter = toParameters[i];
      if (targetParameter.enabled) {
        parameters[i].lerp(targetParameter.value, factor);
      }
    }
  }

  /**
   * Get all parameters of the post process effect.
   * @remarks
   * Only get the parameters that are initialized in the constructor.
   * It will don't take effect if you add a new parameter after the post process effect is created, such as `effect.** = new PostProcessEffectParameter(1)`
   */
  private _getParameters(): PostProcessEffectParameter<any>[] {
    if (!this._parameterInitialized) {
      this._parameterInitialized = true;
      for (let key in this) {
        const value = this[key];
        if (value instanceof PostProcessEffectParameter) {
          this._parameters.push(value);
        }
      }
    }
    return this._parameters;
  }
}
