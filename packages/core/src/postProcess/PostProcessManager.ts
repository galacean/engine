import { Blitter } from "../RenderPipeline/Blitter";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { Material } from "../material";
import { Shader } from "../shader";
import { RenderTarget, Texture2D } from "../texture";
import { PostProcess } from "./PostProcess";

/**
 * A global manager of the PostProcess.
 */
export class PostProcessManager {
  static readonly UBER_SHADER_NAME = "UberPost";

  /**
   * Whether the post process manager is active.
   */
  isActive = true;

  /** @internal */
  _uberMaterial: Material;

  private _activePostProcesses: PostProcess[] = [];
  private _postProcessNeedSorting = false;

  /**
   * Whether has active post process effect.
   */
  get hasActiveEffect(): boolean {
    // @todo
    return this.isActive;
  }

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {
    const uberShader = Shader.find(PostProcessManager.UBER_SHADER_NAME);
    const uberMaterial = new Material(scene.engine, uberShader);
    const depthState = uberMaterial.renderState.depthState;

    depthState.enabled = false;
    depthState.writeEnabled = false;

    this._uberMaterial = uberMaterial;
  }

  addPostProcess(postProcess: PostProcess): void {
    this._activePostProcesses.push(postProcess);
    this._postProcessNeedSorting = true;
  }

  removePostProcess(postProcess: PostProcess): void {
    const index = this._activePostProcesses.indexOf(postProcess);

    if (index >= 0) {
      this._activePostProcesses.splice(index, 1);
      this._postProcessNeedSorting = true;
    }
  }

  sortPostProcess(): void {
    if (this._postProcessNeedSorting) {
      const postProcesses = this._activePostProcesses;
      if (postProcesses.length) {
        postProcesses.sort((a, b) => a.priority - b.priority);
      }
      this._postProcessNeedSorting = false;
    }
  }

  render(context: RenderContext, srcTarget: RenderTarget, destTarget: RenderTarget): void {
    const camera = context.camera;
    const engine = camera.engine;
    const postProcesses = this._activePostProcesses;

    // Should blit to resolve the MSAA
    srcTarget._blitRenderTarget();
    const srcTexture = <Texture2D>srcTarget.getColorTexture();

    for (let i = 0; i < postProcesses.length; i++) {
      const postProcess = postProcesses[i];

      if (!(camera.postProcessMask & postProcess.layer)) {
        continue;
      }

      const effects = postProcess.effects;

      for (let j = 0; j < effects.length; j++) {
        const effect = effects[j];
        if (effect.enabled) {
          effect.onRender(context, srcTexture);
        }
      }
    }

    // Done with Uber, blit it
    Blitter.blitTexture(engine, srcTexture, destTarget, 0, camera.viewport, this._uberMaterial);
  }
}
