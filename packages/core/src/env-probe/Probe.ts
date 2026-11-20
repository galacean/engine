import { Camera } from "../Camera";
import { ignoreClone } from "../clone/CloneDecorators";
import { Layer } from "../Layer";
import { Script } from "../Script";
import { RenderBufferDepthFormat, Texture, Texture2D, TextureCube } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";

/**
 * Environmental probes, providing necessary capabilities such as reflection and refraction.
 * @example
 * ```ts
 * const probe = cameraEntity.addComponent( CubeProbe )
 * probe.onTextureChange = cubeTexture => {
 *   envLight.specularTexture = cubeTexture;
 *   skybox.specularTexture = cubeTexture;
 * }
 * ```
 */
export abstract class Probe extends Script {
  /**
   * Probe's layer, render everything by default.
   */
  probeLayer: Layer = Layer.Everything;

  /**
   * The width of the probe rendering target.
   */
  width: number = 1024;

  /**
   * The height of the probe rendering target.
   */
  height: number = 1024;

  /**
   * Anti-aliasing level (MSAA) for the probe render target.
   */
  antiAliasing: number = 1;

  /**
   * Whether the probe is rendered to the cube color texture.
   */
  protected readonly _isCube: boolean = false;

  @ignoreClone
  private _oriCameraRenderTarget: RenderTarget | null;
  @ignoreClone
  private _renderTarget: RenderTarget;
  @ignoreClone
  private _renderTargetSwap: RenderTarget;
  @ignoreClone
  private _activeRenderTarget: RenderTarget;
  @ignoreClone
  private _camera: Camera;
  @ignoreClone
  private _oriCameraCullingMask: Layer;

  private get _texture(): Texture | null {
    return this._activeRenderTarget?.getColorTexture();
  }

  /**
   * Provide hooks for users to exchange Texture.
   * @remarks Prevent issue: Feedback Loops Between Textures and the Framebuffer.
   */
  onTextureChange(renderColorTexture: Texture | null) {}

  override onBeginRender(camera: Camera): void {
    if (!this.enabled) return;
    this._camera = camera;
    this._oriCameraCullingMask = camera.cullingMask;
    camera.cullingMask = this.probeLayer;
    if (
      !this._activeRenderTarget ||
      this._activeRenderTarget.width !== this.width ||
      this._activeRenderTarget.height !== this.height ||
      this._activeRenderTarget.antiAliasing !== this.antiAliasing
    ) {
      this._destroyRenderTargets();

      this._renderTarget = new RenderTarget(
        this.engine,
        this.width,
        this.height,
        this._isCube ? new TextureCube(this.engine, this.width) : new Texture2D(this.engine, this.width, this.height),
        RenderBufferDepthFormat.Depth,
        this.antiAliasing
      );
      this._renderTarget._addReferCount(1);

      this._renderTargetSwap = new RenderTarget(
        this.engine,
        this.width,
        this.height,
        this._isCube ? new TextureCube(this.engine, this.width) : new Texture2D(this.engine, this.width, this.height),
        RenderBufferDepthFormat.Depth,
        this.antiAliasing
      );
      this._renderTargetSwap._addReferCount(1);

      this._activeRenderTarget = this._renderTarget;
    }

    this._oriCameraRenderTarget = camera.renderTarget;
    camera.renderTarget = this._activeRenderTarget;
  }

  override onEndRender(camera: Camera): void {
    if (!this.enabled) return;

    this.onTextureChange && this.onTextureChange(this._texture);

    this._activeRenderTarget =
      this._activeRenderTarget === this._renderTarget ? this._renderTargetSwap : this._renderTarget;
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._destroyRenderTargets();
    this._camera = null!;
    this._oriCameraRenderTarget = null;
  }

  protected _reset(): void {
    if (!this.enabled) return;
    this._camera.renderTarget = this._oriCameraRenderTarget;
    this._camera.cullingMask = this._oriCameraCullingMask;
  }

  private _destroyRenderTargets(): void {
    if (this._renderTarget) {
      this._destroyRenderTarget(this._renderTarget);
      this._renderTarget = null!;
    }
    if (this._renderTargetSwap) {
      this._destroyRenderTarget(this._renderTargetSwap);
      this._renderTargetSwap = null!;
    }
    this._activeRenderTarget = null!;
  }

  private _destroyRenderTarget(renderTarget: RenderTarget): void {
    const colorTexture = renderTarget.getColorTexture(0);
    if (!renderTarget.destroyed && !renderTarget.pendingDestroy) {
      renderTarget._addReferCount(-1);
      renderTarget.destroy();
    }
    if (colorTexture && !colorTexture.destroyed) {
      if (renderTarget.pendingDestroy) {
        // RenderTarget._onDestroy() is deferred until end of frame, so its +1 ref on colorTexture
        // has not been decremented yet. Queue colorTexture destruction only when no external ref exists.
        if (colorTexture.refCount <= 1) {
          colorTexture.destroy(true);
        }
      } else {
        colorTexture.destroy();
      }
    }
  }
}
