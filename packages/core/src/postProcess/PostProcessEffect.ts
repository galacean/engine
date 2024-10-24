import { ignoreClone } from "../clone/CloneManager";
import { Material } from "../material/Material";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Texture2D } from "../texture";
import { PostProcess } from "./PostProcess";

/**
 * The base class for post process effect.
 */
export class PostProcessEffect {
  @ignoreClone
  private _phasedActive: boolean = false;

  private _enabled: boolean = true;

  /**
   * The Uber material used to render the post process effect.
   */
  get uberMaterial(): Material {
    return this.postProcess.scene._postProcessManager._uberMaterial;
  }

  /**
   * Indicates whether the post process effect is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    const postProcessManager = this.postProcess.scene._postProcessManager;

    if (value !== this._enabled) {
      this._enabled = value;

      if (this.postProcess._phasedActive) {
        if (value) {
          if (!this._phasedActive) {
            this._phasedActive = true;
            postProcessManager._setActiveStateDirty();
            this.onEnable();
          }
        } else {
          if (this._phasedActive) {
            this._phasedActive = false;
            postProcessManager._setActiveStateDirty();
            this.onDisable();
          }
        }
      }
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
   * Called when the post process effect is rendered.
   * @param context - The render context
   * @param srcTexture - The source texture from last render target
   */
  onRender(context: RenderContext, srcTexture: Texture2D): void {}

  /**
   * @internal
   */
  _setActive(value: boolean): void {
    const postProcess = this.postProcess;
    const postProcessManager = postProcess.scene._postProcessManager;

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
