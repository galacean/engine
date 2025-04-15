import { BoundingFrustum, MathUtil, Matrix, Ray, Rect, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { BoolUpdateFlag } from "./BoolUpdateFlag";
import { Component } from "./Component";
import { DependentMode, dependentComponents } from "./ComponentsDependencies";
import { Entity } from "./Entity";
import { Layer } from "./Layer";
import { BasicRenderPipeline } from "./RenderPipeline/BasicRenderPipeline";
import { PipelineUtils } from "./RenderPipeline/PipelineUtils";
import { Transform } from "./Transform";
import { UpdateFlagManager } from "./UpdateFlagManager";
import { VirtualCamera } from "./VirtualCamera";
import { GLCapabilityType, Logger } from "./base";
import { deepClone, ignoreClone } from "./clone/CloneManager";
import { CameraClearFlags } from "./enums/CameraClearFlags";
import { CameraModifyFlags } from "./enums/CameraModifyFlags";
import { CameraType } from "./enums/CameraType";
import { DepthTextureMode } from "./enums/DepthTextureMode";
import { Downsampling } from "./enums/Downsampling";
import { MSAASamples } from "./enums/MSAASamples";
import { ReplacementFailureStrategy } from "./enums/ReplacementFailureStrategy";
import { Shader } from "./shader/Shader";
import { ShaderData } from "./shader/ShaderData";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { ShaderProperty } from "./shader/ShaderProperty";
import { ShaderTagKey } from "./shader/ShaderTagKey";
import { ShaderDataGroup } from "./shader/enums/ShaderDataGroup";
import { TextureFormat } from "./texture";
import { RenderTarget } from "./texture/RenderTarget";
import { TextureCubeFace } from "./texture/enums/TextureCubeFace";

class MathTemp {
  static tempVec4 = new Vector4();
  static tempVec3 = new Vector3();
  static tempVec2 = new Vector2();
}

/**
 * Camera component, as the entrance to the three-dimensional world.
 * @decorator `@dependentComponents(Transform, DependentMode.CheckOnly)`
 */
@dependentComponents(Transform, DependentMode.CheckOnly)
export class Camera extends Component {
  /** @internal */
  static _cameraDepthTextureProperty = ShaderProperty.getByName("camera_DepthTexture");
  /** @internal */
  static _cameraOpaqueTextureProperty = ShaderProperty.getByName("camera_OpaqueTexture");

  private static _inverseViewMatrixProperty = ShaderProperty.getByName("camera_ViewInvMat");
  private static _cameraPositionProperty = ShaderProperty.getByName("camera_Position");
  private static _cameraForwardProperty = ShaderProperty.getByName("camera_Forward");
  private static _cameraUpProperty = ShaderProperty.getByName("camera_Up");
  private static _cameraDepthBufferParamsProperty = ShaderProperty.getByName("camera_DepthBufferParams");

  /** Whether to enable frustum culling, it is enabled by default. */
  enableFrustumCulling: boolean = true;

  /**
   * Determining what to clear when rendering by a Camera.
   *
   * @defaultValue `CameraClearFlags.All`
   */
  clearFlags: CameraClearFlags = CameraClearFlags.All;

  /**
   * Culling mask - which layers the camera renders.
   * @remarks Support bit manipulation, corresponding to `Layer`.
   */
  cullingMask: Layer = Layer.Everything;

  /**
   * Determines which PostProcess to use.
   */
  postProcessMask: Layer = Layer.Everything;

  /**
   * Depth texture mode.
   * If `DepthTextureMode.PrePass` is used, the depth texture can be accessed in the shader using `camera_DepthTexture`.
   *
   * @defaultValue `DepthTextureMode.None`
   */
  depthTextureMode: DepthTextureMode = DepthTextureMode.None;

  /**
   * Opacity texture down sampling.
   *
   * @defaultValue `Downsampling.TwoX`
   */
  opaqueTextureDownsampling: Downsampling = Downsampling.TwoX;

  /**
   * Multi-sample anti-aliasing samples when use independent canvas mode.
   *
   * @remarks It will take effect when `independentCanvasEnabled` property is `true`, otherwise it will be invalid.
   */
  msaaSamples: MSAASamples = MSAASamples.None;

  /** @internal */
  _cameraType: CameraType = CameraType.Normal;
  /** @internal */
  _globalShaderMacro: ShaderMacroCollection = new ShaderMacroCollection();
  /** @internal */
  @deepClone
  _frustum: BoundingFrustum = new BoundingFrustum();
  /** @internal */
  @ignoreClone
  _renderPipeline: BasicRenderPipeline;
  /** @internal */
  @ignoreClone
  _virtualCamera: VirtualCamera = new VirtualCamera();
  /** @internal */
  _replacementShader: Shader = null;
  /** @internal */
  _replacementSubShaderTag: ShaderTagKey = null;
  /** @internal */
  _replacementFailureStrategy: ReplacementFailureStrategy = null;
  /** @internal */
  @ignoreClone
  _cameraIndex: number = -1;

  private _priority: number = 0;
  private _shaderData: ShaderData = new ShaderData(ShaderDataGroup.Camera);
  private _isCustomViewMatrix = false;
  private _isCustomProjectionMatrix = false;
  private _fieldOfView: number = 45;
  private _orthographicSize: number = 10;
  private _isProjectionDirty = true;
  private _isInvProjMatDirty: boolean = true;
  private _customAspectRatio: number | undefined = undefined;
  private _renderTarget: RenderTarget = null;
  private _depthBufferParams: Vector4 = new Vector4();
  private _opaqueTextureEnabled: boolean = false;
  private _enableHDR = false;
  private _enablePostProcess = false;

  @ignoreClone
  private _updateFlagManager: UpdateFlagManager;
  @ignoreClone
  private _frustumChangeFlag: BoolUpdateFlag;
  @ignoreClone
  private _isViewMatrixDirty: BoolUpdateFlag;
  @ignoreClone
  private _isInvViewProjDirty: BoolUpdateFlag;
  @deepClone
  private _viewport: Vector4 = new Vector4(0, 0, 1, 1);
  @deepClone
  private _pixelViewport: Rect = new Rect(0, 0, 0, 0);
  @deepClone
  private _inverseProjectionMatrix: Matrix = new Matrix();
  @deepClone
  private _invViewProjMat: Matrix = new Matrix();

  /**
   * Whether to enable opaque texture.
   * If enabled, the opaque texture can be accessed in the shader using `camera_OpaqueTexture`.
   *
   * @defaultValue `false`
   * @remarks If enabled, the `independentCanvasEnabled` property will be forced to be true.
   */
  get opaqueTextureEnabled(): boolean {
    return this._opaqueTextureEnabled;
  }

  set opaqueTextureEnabled(value: boolean) {
    if (this._opaqueTextureEnabled !== value) {
      this._opaqueTextureEnabled = value;
      this._checkMainCanvasAntialiasWaste();
    }
  }

  /**
   * Whether independent canvas is enabled.
   * @remarks If true, the msaa in viewport can turn or off independently by `msaaSamples` property.
   */
  get independentCanvasEnabled(): boolean {
    // Uber pass need internal RT
    if (this.enablePostProcess && this.scene.postProcessManager._isValid()) {
      return true;
    }

    if (this.enableHDR || this.opaqueTextureEnabled) {
      return this._getInternalColorTextureFormat() !== this.renderTarget?.getColorTexture(0).format;
    }

    return false;
  }

  /**
   * Shader data.
   */
  get shaderData(): ShaderData {
    return this._shaderData;
  }

  /**
   * Near clip plane - the closest point to the camera when rendering occurs.
   */
  get nearClipPlane(): number {
    return this._virtualCamera.nearClipPlane;
  }

  set nearClipPlane(value: number) {
    this._virtualCamera.nearClipPlane = value;
    this._projectionMatrixChange();
  }

  /**
   * Far clip plane - the furthest point to the camera when rendering occurs.
   */
  get farClipPlane(): number {
    return this._virtualCamera.farClipPlane;
  }

  set farClipPlane(value: number) {
    this._virtualCamera.farClipPlane = value;
    this._projectionMatrixChange();
  }

  /**
   * The camera's view angle. activating when camera use perspective projection.
   */
  get fieldOfView(): number {
    return this._fieldOfView;
  }

  set fieldOfView(value: number) {
    if (this._fieldOfView !== value) {
      this._fieldOfView = value;
      this._projectionMatrixChange();
      this._dispatchModify(CameraModifyFlags.FieldOfView);
    }
  }

  /**
   * Aspect ratio. The default is automatically calculated by the viewport's aspect ratio. If it is manually set,
   * the manual value will be kept. Call resetAspectRatio() to restore it.
   */
  get aspectRatio(): number {
    const pixelViewport = this.pixelViewport;
    return this._customAspectRatio ?? pixelViewport.width / pixelViewport.height;
  }

  set aspectRatio(value: number) {
    this._customAspectRatio = value;
    this._projectionMatrixChange();
    this._dispatchModify(CameraModifyFlags.AspectRatio);
  }

  /**
   * The viewport of the camera in normalized coordinates on the screen.
   * In normalized screen coordinates, the upper-left corner is (0, 0), and the lower-right corner is (1.0, 1.0).
   * @remarks Re-assignment is required after modification to ensure that the modification takes effect.
   */
  get viewport(): Vector4 {
    return this._viewport;
  }

  set viewport(value: Vector4) {
    if (value !== this._viewport) {
      this._viewport.copyFrom(value);
    }
  }

  /**
   * The viewport of the camera in pixel coordinates on the screen.
   * In pixel screen coordinates, the upper-left corner is (0, 0), and the lower-right corner is (1.0, 1.0).
   */
  get pixelViewport(): Rect {
    return this._pixelViewport;
  }

  /**
   * Rendering priority, higher priority will be rendered on top of a camera with lower priority.
   */
  get priority(): number {
    return this._priority;
  }

  set priority(value: number) {
    if (this._priority !== value) {
      if (this._phasedActiveInScene) {
        this.scene._componentsManager._cameraNeedSorting = true;
      }
      this._priority = value;
    }
  }

  /**
   * Whether it is orthogonal, the default is false. True will use orthographic projection, false will use perspective projection.
   */
  get isOrthographic(): boolean {
    return this._virtualCamera.isOrthographic;
  }

  set isOrthographic(value: boolean) {
    const { _virtualCamera: virtualCamera } = this;
    if (virtualCamera.isOrthographic !== value) {
      virtualCamera.isOrthographic = value;
      this._projectionMatrixChange();
      if (value) {
        this.shaderData.enableMacro("CAMERA_ORTHOGRAPHIC");
      } else {
        this.shaderData.disableMacro("CAMERA_ORTHOGRAPHIC");
      }
      this._dispatchModify(CameraModifyFlags.ProjectionType);
    }
  }

  /**
   * Half the size of the camera in orthographic mode.
   */
  get orthographicSize(): number {
    return this._orthographicSize;
  }

  set orthographicSize(value: number) {
    if (this._orthographicSize !== value) {
      this._orthographicSize = value;
      this._projectionMatrixChange();
      this._dispatchModify(CameraModifyFlags.OrthographicSize);
    }
  }

  /**
   * View matrix.
   */
  get viewMatrix(): Readonly<Matrix> {
    const viewMatrix = this._virtualCamera.viewMatrix;

    if (!this._isViewMatrixDirty.flag || this._isCustomViewMatrix) {
      return viewMatrix;
    }
    this._isViewMatrixDirty.flag = false;

    // Ignore scale
    const transform = this._entity.transform;
    Matrix.rotationTranslation(transform.worldRotationQuaternion, transform.worldPosition, viewMatrix);
    viewMatrix.invert();
    return viewMatrix;
  }

  set viewMatrix(value: Matrix) {
    this._virtualCamera.viewMatrix.copyFrom(value);
    this._isCustomViewMatrix = true;
    this._viewMatrixChange();
  }

  /**
   * The projection matrix is ​​calculated by the relevant parameters of the camera by default.
   * If it is manually set, the manual value will be maintained. Call resetProjectionMatrix() to restore it.
   */
  get projectionMatrix(): Readonly<Matrix> {
    const virtualCamera = this._virtualCamera;
    const projectionMatrix = virtualCamera.projectionMatrix;

    if (!this._isProjectionDirty || this._isCustomProjectionMatrix) {
      return projectionMatrix;
    }
    this._isProjectionDirty = false;

    const aspectRatio = this.aspectRatio;
    if (!virtualCamera.isOrthographic) {
      Matrix.perspective(
        MathUtil.degreeToRadian(this._fieldOfView),
        aspectRatio,
        this.nearClipPlane,
        this.farClipPlane,
        projectionMatrix
      );
    } else {
      const width = this._orthographicSize * aspectRatio;
      const height = this._orthographicSize;
      Matrix.ortho(-width, width, -height, height, this.nearClipPlane, this.farClipPlane, projectionMatrix);
    }
    return projectionMatrix;
  }

  set projectionMatrix(value: Matrix) {
    this._virtualCamera.projectionMatrix.copyFrom(value);
    this._isCustomProjectionMatrix = true;
    this._projectionMatrixChange();
  }

  /**
   * Whether to enable HDR.
   * @defaultValue `false`
   * @remarks If enabled, the `independentCanvasEnabled` property will be forced to be true.
   */
  get enableHDR(): boolean {
    return this._enableHDR;
  }

  set enableHDR(value: boolean) {
    if (this.enableHDR !== value) {
      const rhi = this.engine._hardwareRenderer;
      const supportHDR = rhi.isWebGL2 || rhi.canIUse(GLCapabilityType.textureHalfFloat);
      if (value && !supportHDR) {
        Logger.warn("Can't enable HDR in this device.");
        return;
      }
      this._enableHDR = value;
      this._checkMainCanvasAntialiasWaste();
    }
  }

  /**
   * Whether to enable post process.
   * @defaultValue `false`
   * @remarks If enabled, the `independentCanvasEnabled` property will be forced to be true.
   */
  get enablePostProcess(): boolean {
    return this._enablePostProcess;
  }

  set enablePostProcess(value: boolean) {
    if (this._enablePostProcess !== value) {
      this._enablePostProcess = value;
      this._checkMainCanvasAntialiasWaste();
    }
  }

  /**
   * RenderTarget. After setting, it will be rendered to the renderTarget. If it is empty, it will be rendered to the main canvas.
   */
  get renderTarget(): RenderTarget | null {
    return this._renderTarget;
  }

  set renderTarget(value: RenderTarget | null) {
    if (this._renderTarget !== value) {
      this._renderTarget && this._addResourceReferCount(this._renderTarget, -1);
      value && this._addResourceReferCount(value, 1);
      this._renderTarget = value;
      this._onPixelViewportChanged();
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);

    this._isViewMatrixDirty = entity.registerWorldChangeFlag();
    this._isInvViewProjDirty = entity.registerWorldChangeFlag();
    this._frustumChangeFlag = entity.registerWorldChangeFlag();
    this._renderPipeline = new BasicRenderPipeline(this);
    this._addResourceReferCount(this.shaderData, 1);
    this._updatePixelViewport();

    this._onPixelViewportChanged = this._onPixelViewportChanged.bind(this);
    //@ts-ignore
    this._viewport._onValueChanged = this._onPixelViewportChanged;
    this.engine.canvas._sizeUpdateFlagManager.addListener(this._onPixelViewportChanged);
  }

  /**
   * Restore the view matrix to the world matrix of the entity.
   */
  resetViewMatrix(): void {
    this._isCustomViewMatrix = false;
    this._viewMatrixChange();
  }

  /**
   * Restore the automatic calculation of projection matrix through fieldOfView, nearClipPlane and farClipPlane.
   */
  resetProjectionMatrix(): void {
    this._isCustomProjectionMatrix = false;
    this._projectionMatrixChange();
  }

  /**
   * Restore the automatic calculation of the aspect ratio through the viewport aspect ratio.
   */
  resetAspectRatio(): void {
    this._customAspectRatio = undefined;
    this._projectionMatrixChange();
    this._dispatchModify(CameraModifyFlags.AspectRatio);
  }

  /**
   * Transform a point from world space to viewport space.
   * @param point - Point in world space
   * @param out - Point in viewport space, X and Y are the camera viewport space coordinates, Z is in world space units from the plane that camera forward is normal to
   * @returns Point in viewport space
   */
  worldToViewportPoint(point: Vector3, out: Vector3): Vector3 {
    const cameraPoint = MathTemp.tempVec3;
    const viewportPoint = MathTemp.tempVec4;

    Vector3.transformCoordinate(point, this.viewMatrix, cameraPoint);
    Vector3.transformToVec4(cameraPoint, this.projectionMatrix, viewportPoint);

    const w = viewportPoint.w;
    out.set((viewportPoint.x / w + 1.0) * 0.5, (1.0 - viewportPoint.y / w) * 0.5, -cameraPoint.z);
    return out;
  }

  /**
   * Transform a point from viewport space to world space.
   * @param point - Point in viewport space, X and Y are the camera viewport space coordinates, Z is in world space units from the plane that camera forward is normal to
   * @param out - Point in world space
   * @returns Point in world space
   */
  viewportToWorldPoint(point: Vector3, out: Vector3): Vector3 {
    const { nearClipPlane, farClipPlane } = this;
    const nf = 1 / (nearClipPlane - farClipPlane);

    let z: number;
    if (this.isOrthographic) {
      z = -point.z * 2 * nf;
      z += (farClipPlane + nearClipPlane) * nf;
    } else {
      const pointZ = point.z;
      z = -pointZ * (nearClipPlane + farClipPlane) * nf;
      z += 2 * nearClipPlane * farClipPlane * nf;
      z = z / pointZ;
    }

    this._innerViewportToWorldPoint(point.x, point.y, (z + 1.0) / 2.0, this._getInvViewProjMat(), out);
    return out;
  }

  /**
   * Generate a ray by a point in viewport.
   * @param point - Point in viewport space, X and Y are the camera viewport space coordinates
   * @param out - Ray
   * @returns Ray
   */
  viewportPointToRay(point: Vector2, out: Ray): Ray {
    const invViewProjMat = this._getInvViewProjMat();
    // Use the intersection of the near clipping plane as the origin point.
    const origin = this._innerViewportToWorldPoint(point.x, point.y, 0.0, invViewProjMat, out.origin);
    // Use the intersection of the far clipping plane as the origin point.
    const direction = this._innerViewportToWorldPoint(
      point.x,
      point.y,
      1 - MathUtil.zeroTolerance,
      invViewProjMat,
      out.direction
    );
    Vector3.subtract(direction, origin, direction);
    direction.normalize();
    return out;
  }

  /**
   * Transform the X and Y coordinates of a point from screen space to viewport space
   * @param point - Point in screen space
   * @param out - Point in viewport space
   * @returns Point in viewport space
   */
  screenToViewportPoint<T extends Vector2 | Vector3>(point: Vector3 | Vector2, out: T): T {
    const canvas = this.engine.canvas;
    const viewport = this.viewport;
    out.x = (point.x / canvas.width - viewport.x) / viewport.z;
    out.y = (point.y / canvas.height - viewport.y) / viewport.w;
    (<Vector3>point).z !== undefined && ((<Vector3>out).z = (<Vector3>point).z);
    return out;
  }

  /**
   * Transform the X and Y coordinates of a point from viewport space to screen space.
   * @param point - Point in viewport space
   * @param out - Point in screen space
   * @returns Point in screen space
   */
  viewportToScreenPoint<T extends Vector2 | Vector3 | Vector4>(point: T, out: T): T {
    const canvas = this.engine.canvas;
    const viewport = this.viewport;
    out.x = (viewport.x + point.x * viewport.z) * canvas.width;
    out.y = (viewport.y + point.y * viewport.w) * canvas.height;
    (<Vector3>point).z !== undefined && ((<Vector3>out).z = (<Vector3>point).z);
    return out;
  }

  /**
   * Transform a point from world space to screen space.
   *
   * @remarks
   * Screen space is defined in pixels, the left-top of the screen is (0,0), the right-top is (canvasPixelWidth,canvasPixelHeight).
   *
   * @param point - Point in world space
   * @param out - The result will be stored
   * @returns X and Y are the coordinates of the point in screen space, Z is the distance from the camera in world space
   */
  worldToScreenPoint(point: Vector3, out: Vector3): Vector3 {
    this.worldToViewportPoint(point, out);
    return this.viewportToScreenPoint(out, out);
  }

  /**
   * Transform a point from screen space to world space.
   *
   * @param point - Screen space point, the top-left of the screen is (0,0), the right-bottom is (pixelWidth,pixelHeight), The z position is in world units from the camera
   * @param out - Point in world space
   * @returns Point in world space
   */
  screenToWorldPoint(point: Vector3, out: Vector3): Vector3 {
    this.screenToViewportPoint(point, out);
    return this.viewportToWorldPoint(out, out);
  }

  /**
   * Generate a ray by a point in screen.
   * @param point - Point in screen space, the top-left of the screen is (0,0), the right-bottom is (pixelWidth,pixelHeight)
   * @param out - Ray
   * @returns Ray
   */
  screenPointToRay(point: Vector2, out: Ray): Ray {
    const viewportPoint = MathTemp.tempVec2;
    this.screenToViewportPoint(point, viewportPoint);
    return this.viewportPointToRay(viewportPoint, out);
  }

  /**
   * Manually call the rendering of the camera.
   * @param cubeFace - Cube rendering surface collection
   * @param mipLevel - Set mip level the data want to write, only take effect in webgl2.0
   */
  render(cubeFace?: TextureCubeFace, mipLevel: number = 0): void {
    const engine = this._engine;
    const context = engine._renderContext;
    const virtualCamera = this._virtualCamera;

    const transform = this._entity.transform;
    Matrix.multiply(this.projectionMatrix, this.viewMatrix, virtualCamera.viewProjectionMatrix);
    virtualCamera.position.copyFrom(transform.worldPosition);
    if (virtualCamera.isOrthographic) {
      virtualCamera.forward.copyFrom(transform.worldForward);
    }

    context.camera = this;
    context.virtualCamera = virtualCamera;
    context.replacementShader = this._replacementShader;
    context.replacementTag = this._replacementSubShaderTag;
    context.replacementFailureStrategy = this._replacementFailureStrategy;

    // compute cull frustum.
    if (this.enableFrustumCulling && this._frustumChangeFlag.flag) {
      this._frustum.calculateFromMatrix(virtualCamera.viewProjectionMatrix);
      this._frustumChangeFlag.flag = false;
    }

    this._updateShaderData();

    // union scene and camera macro.
    ShaderMacroCollection.unionCollection(
      this.scene._globalShaderMacro,
      this.shaderData._macroCollection,
      this._globalShaderMacro
    );

    if (mipLevel > 0 && !engine._hardwareRenderer.isWebGL2) {
      mipLevel = 0;
      Logger.error("mipLevel only take effect in WebGL2.0");
    }
    let ignoreClearFlags: CameraClearFlags;
    if (this._cameraType !== CameraType.Normal && !this._renderTarget && !this.independentCanvasEnabled) {
      ignoreClearFlags = engine.xrManager._getCameraIgnoreClearFlags(this._cameraType);
    }
    this._renderPipeline.render(context, cubeFace, mipLevel, ignoreClearFlags);
    engine._renderCount++;
  }

  /**
   * Set the replacement shader.
   * @param shader - Replacement shader
   * @param replacementTagName - Sub shader tag name
   * @param failureStrategy - Replacement failure strategy, @defaultValue `ReplacementFailureStrategy.KeepOriginalShader`
   *
   * @remarks
   * If replacementTagName is not specified, the first sub shader will be replaced.
   * If replacementTagName is specified, the replacement shader will find the first sub shader which has the same tag value get by replacementTagKey. If failed to find the sub shader, the strategy will be determined by failureStrategy.
   */
  setReplacementShader(shader: Shader, replacementTagName?: string, failureStrategy?: ReplacementFailureStrategy);

  /**
   * Set the replacement shader.
   * @param shader - Replacement shader
   * @param replacementTag - Sub shader tag
   * @param failureStrategy - Replacement failure strategy, @defaultValue `ReplacementFailureStrategy.KeepOriginalShader`
   *
   * @remarks
   * If replacementTag is not specified, the first sub shader will be replaced.
   * If replacementTag is specified, the replacement shader will find the first sub shader which has the same tag value get by replacementTagKey. If failed to find the sub shader, the strategy will be determined by failureStrategy.
   */
  setReplacementShader(shader: Shader, replacementTag?: ShaderTagKey, failureStrategy?: ReplacementFailureStrategy);

  setReplacementShader(
    shader: Shader,
    replacementTag?: string | ShaderTagKey,
    failureStrategy: ReplacementFailureStrategy = ReplacementFailureStrategy.KeepOriginalShader
  ): void {
    this._replacementShader = shader;
    this._replacementSubShaderTag =
      typeof replacementTag === "string" ? ShaderTagKey.getByName(replacementTag) : replacementTag;
    this._replacementFailureStrategy = failureStrategy;
  }

  /**
   * Reset and clear the replacement shader.
   */
  resetReplacementShader(): void {
    this._replacementShader = null;
    this._replacementSubShaderTag = null;
    this._replacementFailureStrategy = null;
  }

  /**
   * @inheritdoc
   */
  override _onEnableInScene(): void {
    this.scene._componentsManager.addCamera(this);
    this._dispatchModify(CameraModifyFlags.EnableInScene);
  }

  /**
   * @inheritdoc
   */
  override _onDisableInScene(): void {
    this.scene._componentsManager.removeCamera(this);
    this._dispatchModify(CameraModifyFlags.DisableInScene);
  }

  /**
   * @internal
   */
  _getInternalColorTextureFormat(): TextureFormat {
    return this._enableHDR
      ? this.engine._hardwareRenderer.isWebGL2
        ? TextureFormat.R11G11B10_UFloat
        : TextureFormat.R16G16B16A16
      : TextureFormat.R8G8B8A8;
  }

  /**
   * @internal
   */
  _registerModifyListener(onChange: (flag: CameraModifyFlags) => void): void {
    (this._updateFlagManager ||= new UpdateFlagManager()).addListener(onChange);
  }

  /**
   * @internal
   */
  _unRegisterModifyListener(onChange: (flag: CameraModifyFlags) => void): void {
    this._updateFlagManager?.removeListener(onChange);
  }

  /**
   * @internal
   * @inheritdoc
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    this._renderPipeline?.destroy();
    this._isInvViewProjDirty.destroy();
    this._isViewMatrixDirty.destroy();
    this._addResourceReferCount(this.shaderData, -1);

    //@ts-ignore
    this._viewport._onValueChanged = null;
    this.engine.canvas._sizeUpdateFlagManager.removeListener(this._onPixelViewportChanged);
    this._globalShaderMacro = null;
    this._frustum = null;
    this._renderPipeline = null;
    this._virtualCamera = null;
    this._shaderData = null;
    this._frustumChangeFlag = null;
    this._isViewMatrixDirty = null;
    this._isInvViewProjDirty = null;
    this._viewport = null;
    this._inverseProjectionMatrix = null;
    this._invViewProjMat = null;
  }

  private _updatePixelViewport(): void {
    let width: number, height: number;

    const renderTarget = this._renderTarget;
    if (renderTarget) {
      width = renderTarget.width;
      height = renderTarget.height;
    } else {
      const canvas = this.engine.canvas;
      width = canvas.width;
      height = canvas.height;
    }

    const viewport = this._viewport;
    this._pixelViewport.set(viewport.x * width, viewport.y * height, viewport.z * width, viewport.w * height);
    !this._customAspectRatio && this._dispatchModify(CameraModifyFlags.AspectRatio);
  }

  private _viewMatrixChange(): void {
    this._isViewMatrixDirty.flag = true;
    this._isInvViewProjDirty.flag = true;
    this._frustumChangeFlag.flag = true;
  }

  private _projectionMatrixChange(): void {
    this._isProjectionDirty = true;
    this._isInvProjMatDirty = true;
    this._isInvViewProjDirty.flag = true;
    this._frustumChangeFlag.flag = true;
  }

  private _innerViewportToWorldPoint(x: number, y: number, z: number, invViewProjMat: Matrix, out: Vector3): Vector3 {
    // Depth is a normalized value, 0 is nearPlane, 1 is farClipPlane.
    // Transform to clipping space matrix
    const clipPoint = MathTemp.tempVec3;
    clipPoint.set(x * 2 - 1, 1 - y * 2, z * 2 - 1);
    Vector3.transformCoordinate(clipPoint, invViewProjMat, out);
    return out;
  }

  private _updateShaderData(): void {
    const shaderData = this.shaderData;

    const transform = this._entity.transform;
    shaderData.setMatrix(Camera._inverseViewMatrixProperty, transform.worldMatrix);
    shaderData.setVector3(Camera._cameraPositionProperty, transform.worldPosition);
    shaderData.setVector3(Camera._cameraForwardProperty, transform.worldForward);
    shaderData.setVector3(Camera._cameraUpProperty, transform.worldUp);

    const depthBufferParams = this._depthBufferParams;
    const farDivideNear = this.farClipPlane / this.nearClipPlane;
    depthBufferParams.set(1.0 - farDivideNear, farDivideNear, 0, 0);
    shaderData.setVector4(Camera._cameraDepthBufferParamsProperty, depthBufferParams);
  }

  /**
   * The inverse matrix of view projection matrix.
   */
  private _getInvViewProjMat(): Matrix {
    if (this._isInvViewProjDirty.flag) {
      this._isInvViewProjDirty.flag = false;
      Matrix.multiply(this._entity.transform.worldMatrix, this._getInverseProjectionMatrix(), this._invViewProjMat);
    }
    return this._invViewProjMat;
  }

  /**
   * The inverse of the projection matrix.
   */
  private _getInverseProjectionMatrix(): Readonly<Matrix> {
    if (this._isInvProjMatDirty) {
      this._isInvProjMatDirty = false;
      Matrix.invert(this.projectionMatrix, this._inverseProjectionMatrix);
    }
    return this._inverseProjectionMatrix;
  }

  @ignoreClone
  private _onPixelViewportChanged(): void {
    this._updatePixelViewport();
    this._customAspectRatio ?? this._projectionMatrixChange();
    this._checkMainCanvasAntialiasWaste();
  }

  private _checkMainCanvasAntialiasWaste(): void {
    if (
      this._phasedActiveInScene &&
      this.independentCanvasEnabled &&
      Vector4.equals(this._viewport, PipelineUtils.defaultViewport)
    ) {
      Logger.warn(
        "Camera use independent canvas and viewport cover the whole screen, it is recommended to disable antialias, depth and stencil to save memory when create engine."
      );
    }
  }

  private _dispatchModify(flag: CameraModifyFlags): void {
    this._updateFlagManager?.dispatch(flag);
  }
}
