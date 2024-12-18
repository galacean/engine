import { PostProcess } from "./PostProcess";
import { PostProcessEffectParameter } from "./PostProcessEffectParameter";

/**
 * The base class for post process effect.
 */
export class PostProcessEffect {
  private _phasedActive = false;

  private _enabled = true;
  private __parameters: PostProcessEffectParameter<any>[] = [];
  private _parameterInitialized = false;

  /**
   * The engine the post process effect belongs to
   */
  get engine() {
    return this.postProcess.engine;
  }

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

    if (!this.postProcess._phasedActive) {
      return;
    }

    const postProcessManager = this.postProcess.scene.postProcessManager;

    if (value && !this._phasedActive) {
      this._phasedActive = true;
      postProcessManager._activeStateChangeFlag = true;
      this.onEnable();
    } else if (!value && this._phasedActive) {
      this._phasedActive = false;
      postProcessManager._activeStateChangeFlag = true;
      this.onDisable();
    }
  }

  /**
   * Get all parameters of the post process effect.
   * @remarks
   * Only get the parameters that are initialized in the constructor.
   * It will don't take effect if you add a new parameter after the post process effect is created, such as `effect.** = new PostProcessEffectParameter(1)`
   */
  private get _parameters(): PostProcessEffectParameter<any>[] {
    if (!this._parameterInitialized) {
      this._parameterInitialized = true;
      for (let key in this) {
        const value = this[key];
        if (value instanceof PostProcessEffectParameter) {
          this.__parameters.push(value);
        }
      }
    }
    return this.__parameters;
  }

  /**
   * Create a post process effect.
   * @param postProcess - The post process being used
   */
  constructor(public postProcess: PostProcess) {}

  /**
   * Called when be enabled.
   */
  onEnable(): void {}

  /**
   * Called when be disabled.
   */
  onDisable(): void {}

  /**
   * Interpolates from the current effect to the end effect by an interpolation factor.
   * @param toEffect - The end effect
  //  * @param interpFactor - The interpolation factor in range [0,1]
   */
  lerp(toEffect: PostProcessEffect, interpFactor: number): void {
    const parameters = this._parameters;
    for (let i = 0; i < parameters.length; i++) {
      const targetParameter = toEffect._parameters[i];
      if (targetParameter.enabled) {
        parameters[i].lerp(targetParameter.value, interpFactor);
      }
    }
  }

  /**
   * @internal
   */
  _setActive(value: boolean): void {
    if (!this.postProcess._phasedActive) {
      return;
    }

    const postProcess = this.postProcess;
    const postProcessManager = postProcess.scene.postProcessManager;
    if (value) {
      if (!this._phasedActive && this._enabled) {
        this._phasedActive = true;
        postProcessManager._activeStateChangeFlag = true;
        this.onEnable();
      }
    } else {
      if (this._phasedActive) {
        this._phasedActive = false;
        postProcessManager._activeStateChangeFlag = true;
        this.onDisable();
      }
    }
  }
}
