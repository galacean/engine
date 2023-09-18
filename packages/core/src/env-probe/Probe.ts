import { Camera } from "../Camera";
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
   * When using WebGL2, you can turn on MSAA at the hardware layer.
   */
  antiAliasing: number = 1;

  /**
   * Whether the probe is rendered to the cube color texture.
   */
  protected readonly _isCube: boolean = false;

  private _oriCameraRenderTarget: RenderTarget;
  private _renderTarget: RenderTarget;
  private _renderTargetSwap: RenderTarget;
  private _activeRenderTarget: RenderTarget;
  private _camera: Camera;
  private _oriCameraCullingMask: Layer;

  private get _texture(): Texture {
    return this._activeRenderTarget?.getColorTexture();
  }

  /**
   * Provide hooks for users to exchange Texture.
   * @remarks Prevent issue: Feedback Loops Between Textures and the Framebuffer.
   */
  onTextureChange(renderColorTexture: Texture) {}

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
      this._renderTarget = new RenderTarget(
        this.engine,
        this.width,
        this.height,
        this._isCube ? new TextureCube(this.engine, this.width) : new Texture2D(this.engine, this.width, this.height),
        RenderBufferDepthFormat.Depth,
        this.antiAliasing
      );

      this._renderTargetSwap = new RenderTarget(
        this.engine,
        this.width,
        this.height,
        this._isCube ? new TextureCube(this.engine, this.width) : new Texture2D(this.engine, this.width, this.height),
        RenderBufferDepthFormat.Depth,
        this.antiAliasing
      );

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

  protected _reset(): void {
    if (!this.enabled) return;
    this._camera.renderTarget = this._oriCameraRenderTarget;
    this._camera.cullingMask = this._oriCameraCullingMask;
  }
}
