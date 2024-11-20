import { ignoreClone } from "../clone/CloneManager";
import { PostProcess } from "./PostProcess";

/**
 * The base class for post process effect.
 */
export class PostProcessEffect {
  @ignoreClone
  private _phasedActive = false;

  private _enabled = true;

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
    const postProcessManager = this.postProcess.scene.postProcessManager;

    if (value === this._enabled) {
      return;
    }

    this._enabled = value;

    if (!this.postProcess._phasedActive) {
      return;
    }

    if (value && !this._phasedActive) {
      this._phasedActive = true;
      postProcessManager._setActiveStateDirty();
      this.onEnable();
    } else if (!value && this._phasedActive) {
      this._phasedActive = false;
      postProcessManager._setActiveStateDirty();
      this.onDisable();
    }
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
   * Interpolates a post process effect with this effect by an interpolation.
   * @param fromEffect - The effect to interpolate from, you must store the result of the interpolation in this same effect
   * @param interpFactor - The interpolation factor in range [0,1]
   */
  lerp(fromEffect: PostProcessEffect, interpFactor: number): void {}

  /**
   * @internal
   */
  _setActive(value: boolean): void {
    const postProcess = this.postProcess;
    const postProcessManager = postProcess.scene.postProcessManager;

    if (value) {
      if (!this._phasedActive && postProcess._phasedActive && this._enabled) {
        this._phasedActive = true;
        postProcessManager._setActiveStateDirty();
        this.onEnable();
      }
    } else {
      if (this._phasedActive && !(postProcess._phasedActive && this.enabled)) {
        this._phasedActive = false;
        postProcessManager._setActiveStateDirty();
        this.onDisable();
      }
    }
  }
}
