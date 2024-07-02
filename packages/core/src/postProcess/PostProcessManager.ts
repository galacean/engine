import { Engine } from "../Engine";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Scene } from "../Scene";
import { RenderTarget, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../texture";
import { SafeLoopArray } from "../utils/SafeLoopArray";
import { PostProcessPass } from "./PostProcessPass";

export class PostProcessManager {
  private static _transformRT: RenderTarget[] = [];
  private static _rtIdentifier = 0;
  private static _srcRenderTarget: RenderTarget;
  private static _destRenderTarget: RenderTarget;

  /**
   * @internal
   */
  static _getSrcRenderTarget(): RenderTarget {
    return this._srcRenderTarget;
  }

  /**
   * @internal
   */
  static _getDestRenderTarget(): RenderTarget {
    return this._destRenderTarget;
  }

  /**
   * @internal
   */
  static _swapRenderTarget(): void {
    this._srcRenderTarget = this._destRenderTarget;
    this._rtIdentifier = (this._rtIdentifier + 1) % 2;

    this._destRenderTarget = this._transformRT[this._rtIdentifier];
  }

  /**
   * @internal
   */
  static _recreateSwapRT(
    engine: Engine,
    width: number,
    height: number,
    textureFormat: TextureFormat,
    msaaSamples: number
  ): void {
    for (let i = 0; i < 2; i++) {
      this._transformRT[i] = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._transformRT[i],
        width,
        height,
        textureFormat,
        null,
        false,
        false,
        msaaSamples,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
    }
  }

  /**
   * @internal
   */
  static _releaseSwapRT(): void {
    for (let i = 0; i < this._transformRT.length; i++) {
      const rt = this._transformRT[i];
      rt.getColorTexture(0)?.destroy(true);
      rt.destroy(true);
    }

    this._transformRT.length = 0;
  }

  /** @internal */
  _passes = new SafeLoopArray<PostProcessPass>();

  /**
   * Get the post process pass list.
   */
  get passes(): ReadonlyArray<PostProcessPass> {
    return this._passes.getArray();
  }

  /**
   * Engine to which the current PostProcessManager belongs
   */
  get engine(): Engine {
    return this.scene.engine;
  }

  /**
   * Create a PostProcessManager.
   * @param scene - Scene to which the current PostProcessManager belongs
   */
  constructor(public readonly scene: Scene) {}

  /**
   * Add post process pass.
   * @param pass - The post process pass want to be added
   */
  addPass(pass: PostProcessPass): void;

  /**
   * Add post process pass at specified index.
   * @param index - Specified index
   * @param pass - The post process pass want to be added
   */
  addPass(index: number, pass: PostProcessPass): void;

  addPass(indexOrPass: number | PostProcessPass, pass?: PostProcessPass): void {
    const passes = this._passes;
    let index: number;

    if (typeof indexOrPass === "number") {
      if (indexOrPass < 0 || indexOrPass > passes.length) {
        throw "The index is out of range.";
      }
      index = indexOrPass;
    } else {
      index = passes.length;
      pass = indexOrPass;
    }

    const currentIndex = passes.indexOf(pass);
    if (currentIndex !== index) {
      if (pass.engine !== this.engine) {
        throw "The post process pass is not belong to this engine.";
      }
      if (currentIndex !== -1) {
        passes.removeByIndex(currentIndex);
      }
      passes.add(index, pass);
    }
  }

  /**
   * Remove post process pass.
   * @param pass - The post process pass want to be removed
   */
  removePass(pass: PostProcessPass): void {
    const passes = this._passes;
    const index = passes.indexOf(pass);
    if (index !== -1) {
      passes.removeByIndex(index);
    }
  }

  /**
   * @internal
   */
  _render(context: RenderContext) {
    const engine = this.engine;
    const { camera, colorTarget } = context;

    if (camera.enablePostProcess) {
      const viewport = camera.pixelViewport;

      PostProcessManager._recreateSwapRT(
        engine,
        viewport.width,
        viewport.height,
        camera._getInternalColorTextureFormat(),
        camera.msaaSamples
      );
      PostProcessManager._srcRenderTarget = colorTarget;
      PostProcessManager._destRenderTarget = PostProcessManager._transformRT[0];

      const postProcesses = this._passes.getLoopArray();

      for (let i = 0, length = postProcesses.length; i < length; i++) {
        const pass = postProcesses[i];
        pass.isActive && pass.onRender(context);
      }

      // @todo: should depends on all effects
      const lastPostRT = PostProcessManager._getSrcRenderTarget();
      if (lastPostRT !== colorTarget) {
        // Should blit to resolve the MSAA
        lastPostRT._blitRenderTarget();
        PipelineUtils.blitTexture(engine, <Texture2D>lastPostRT.getColorTexture(0), colorTarget);
      }
    } else {
      PostProcessManager._releaseSwapRT();
    }
  }
}
