import { BoundingFrustum, MathUtil, Matrix, Ray, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { deepClone, ignoreClone } from "./clone/CloneManager";
import { Component } from "./Component";
import { dependencies } from "./ComponentsDependencies";
import { Entity } from "./Entity";
import { CameraClearFlags } from "./enums/CameraClearFlags";
import { Layer } from "./Layer";
import { BasicRenderPipeline } from "./RenderPipeline/BasicRenderPipeline";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { ShaderDataGroup } from "./shader/enums/ShaderDataGroup";
import { Shader } from "./shader/Shader";
import { ShaderData } from "./shader/ShaderData";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { TextureCubeFace } from "./texture/enums/TextureCubeFace";
import { RenderTarget } from "./texture/RenderTarget";
import { Transform } from "./Transform";
import { UpdateFlag } from "./UpdateFlag";

class MathTemp {
  static tempMat4 = new Matrix();
  static tempVec4 = new Vector4();
  static tempVec3 = new Vector3();
  static tempVec2 = new Vector2();
}

/**
 * Camera component, as the entrance to the three-dimensional world.
 */
@dependencies(Transform)
export class Camera extends Component {
  private static _viewMatrixProperty = Shader.getPropertyByName("u_viewMat");
  private static _projectionMatrixProperty = Shader.getPropertyByName("u_projMat");
  private static _vpMatrixProperty = Shader.getPropertyByName("u_VPMat");
  private static _inverseViewMatrixProperty = Shader.getPropertyByName("u_viewInvMat");
  private static _inverseProjectionMatrixProperty = Shader.getPropertyByName("u_projInvMat");
  private static _cameraPositionProperty = Shader.getPropertyByName("u_cameraPos");

  /** Shader data. */
  readonly shaderData: ShaderData = new ShaderData(ShaderDataGroup.Camera);

  /** Rendering priority - A Camera with higher priority will be rendererd on top of a camera with lower priority. */
  priority: number = 0;

  /** Whether to enable frustum culling, it is enabled by default. */
  enableFrustumCulling: boolean = true;

  /**
   * Determining what to clear when rendering by a Camera.
   * @defaultValue `CameraClearFlags.DepthColor`
   */
  clearFlags: CameraClearFlags = CameraClearFlags.DepthColor;

  /**
   * Culling mask - which layers the camera renders.
   * @remarks Support bit manipulation, conresponding to Entity's layer.
   */
  cullingMask: Layer = Layer.Everything;

  /** @internal */
  _globalShaderMacro: ShaderMacroCollection = new ShaderMacroCollection();
  /** @internal */
  @deepClone
  _frustum: BoundingFrustum = new BoundingFrustum();
  /** @internal */
  @ignoreClone
  _renderPipeline: BasicRenderPipeline;

  private _isOrthographic: boolean = false;
  private _isProjMatSetting = false;
  private _nearClipPlane: number = 0.1;
  private _farClipPlane: number = 100;
  private _fieldOfView: number = 45;
  private _orthographicSize: number = 10;
  private _isProjectionDirty = true;
  private _isInvProjMatDirty: boolean = true;
  private _isFrustumProjectDirty: boolean = true;
  private _customAspectRatio: number | undefined = undefined;
  private _renderTarget: RenderTarget = null;

  @ignoreClone
  private _frustumViewChangeFlag: UpdateFlag;
  @ignoreClone
  private _transform: Transform;
  @ignoreClone
  private _isViewMatrixDirty: UpdateFlag;
  @ignoreClone
  private _isInvViewProjDirty: UpdateFlag;
  @deepClone
  private _projectionMatrix: Matrix = new Matrix();
  @deepClone
  private _viewMatrix: Matrix = new Matrix();
  @deepClone
  private _viewport: Vector4 = new Vector4(0, 0, 1, 1);
  @deepClone
  private _inverseProjectionMatrix: Matrix = new Matrix();
  @deepClone
  private _lastAspectSize: Vector2 = new Vector2(0, 0);
  @deepClone
  private _invViewProjMat: Matrix = new Matrix();

  /**
   * Near clip plane - the cloest point to the camera when rendering occurs.
   */
  get nearClipPlane(): number {
    return this._nearClipPlane;
  }

  set nearClipPlane(value: number) {
    this._nearClipPlane = value;
    this._projMatChange();
  }

  /**
   * Far clip plane - the furthest point to the camera when rendering occurs.
   */
  get farClipPlane(): number {
    return this._farClipPlane;
  }

  set farClipPlane(value: number) {
    this._farClipPlane = value;
    this._projMatChange();
  }

  /**
   * The camera's view angle. activing when camera use perspective projection.
   */
  get fieldOfView(): number {
    return this._fieldOfView;
  }

  set fieldOfView(value: number) {
    this._fieldOfView = value;
    this._projMatChange();
  }

  /**
   * Aspect ratio. The default is automatically calculated by the viewport's aspect ratio. If it is manually set, the manual value will be kept. Call resetAspectRatio() to restore it.
   */
  get aspectRatio(): number {
    const canvas = this._entity.engine.canvas;
    return this._customAspectRatio ?? (canvas.width * this._viewport.z) / (canvas.height * this._viewport.w);
  }

  set aspectRatio(value: number) {
    this._customAspectRatio = value;
    this._projMatChange();
  }

  /**
   * Viewport, normalized expression, the upper left corner is (0, 0), and the lower right corner is (1, 1).
   * @remarks Re-assignment is required after modification to ensure that the modification takes effect.
   */
  get viewport(): Vector4 {
    return this._viewport;
  }

  set viewport(value: Vector4) {
    if (value !== this._viewport) {
      value.cloneTo(this._viewport);
    }
    this._projMatChange();
  }

  /**
   * Whether it is orthogonal, the default is false. True will use orthographic projection, false will use perspective projection.
   */
  get isOrthographic(): boolean {
    return this._isOrthographic;
  }

  set isOrthographic(value: boolean) {
    this._isOrthographic = value;
    this._projMatChange();
  }

  /**
   * Half the size of the camera in orthographic mode.
   */
  get orthographicSize(): number {
    return this._orthographicSize;
  }

  set orthographicSize(value: number) {
    this._orthographicSize = value;
    this._projMatChange();
  }

  /**
   * View matrix.
   */
  get viewMatrix(): Readonly<Matrix> {
    // Remove scale
    if (this._isViewMatrixDirty.flag) {
      this._isViewMatrixDirty.flag = false;
      Matrix.invert(this._transform.worldMatrix, this._viewMatrix);
    }
    return this._viewMatrix;
  }

  /**
   * The projection matrix is ​​calculated by the relevant parameters of the camera by default. If it is manually set, the manual value will be maintained. Call resetProjectionMatrix() to restore it.
   */
  set projectionMatrix(value: Matrix) {
    this._projectionMatrix = value;
    this._isProjMatSetting = true;
    this._projMatChange();
  }

  get projectionMatrix(): Matrix {
    const canvas = this._entity.engine.canvas;
    if (
      (!this._isProjectionDirty || this._isProjMatSetting) &&
      this._lastAspectSize.x === canvas.width &&
      this._lastAspectSize.y === canvas.height
    ) {
      return this._projectionMatrix;
    }
    this._isProjectionDirty = false;
    this._lastAspectSize.x = canvas.width;
    this._lastAspectSize.y = canvas.height;
    const aspectRatio = this.aspectRatio;
    if (!this._isOrthographic) {
      Matrix.perspective(
        MathUtil.degreeToRadian(this._fieldOfView),
        aspectRatio,
        this._nearClipPlane,
        this._farClipPlane,
        this._projectionMatrix
      );
    } else {
      const width = this._orthographicSize * aspectRatio;
      const height = this._orthographicSize;
      Matrix.ortho(-width, width, -height, height, this._nearClipPlane, this._farClipPlane, this._projectionMatrix);
    }
    return this._projectionMatrix;
  }

  /**
   * Whether to enable HDR.
   * @todo When render pipeline modification
   */
  get enableHDR(): boolean {
    console.log("not implemention");
    return false;
  }

  set enableHDR(value: boolean) {
    console.log("not implemention");
  }

  /**
   * RenderTarget. After setting, it will be rendered to the renderTarget. If it is empty, it will be rendered to the main canvas.
   */
  get renderTarget(): RenderTarget | null {
    return this._renderTarget;
  }

  set renderTarget(value: RenderTarget | null) {
    this._renderTarget = value;
  }

  /**
   * Create the Camera component.
   * @param entity - Entity
   */
  constructor(entity: Entity) {
    super(entity);

    const transform = this.entity.transform;
    this._transform = transform;
    this._isViewMatrixDirty = transform.registerWorldChangeFlag();
    this._isInvViewProjDirty = transform.registerWorldChangeFlag();
    this._frustumViewChangeFlag = transform.registerWorldChangeFlag();
    this._renderPipeline = new BasicRenderPipeline(this);
    this.shaderData._addRefCount(1);
  }

  /**
   * Restore the automatic calculation of projection matrix through fieldOfView, nearClipPlane and farClipPlane.
   */
  resetProjectionMatrix(): void {
    this._isProjMatSetting = false;
    this._projMatChange();
  }

  /**
   * Restore the automatic calculation of the aspect ratio through the viewport aspect ratio.
   */
  resetAspectRatio(): void {
    this._customAspectRatio = undefined;
    this._projMatChange();
  }

  /**
   * Transform a point from world space to viewport space.
   * @param point - Point in world space
   * @param out - A point in the viewport space, X and Y are the viewport space coordinates, Z is the viewport depth, the near clipping plane is 0, the far clipping plane is 1, and W is the world unit distance from the camera
   * @returns Point in viewport space
   */
  worldToViewportPoint(point: Vector3, out: Vector4): Vector4 {
    Matrix.multiply(this.projectionMatrix, this.viewMatrix, MathTemp.tempMat4);
    MathTemp.tempVec4.setValue(point.x, point.y, point.z, 1.0);
    Vector4.transform(MathTemp.tempVec4, MathTemp.tempMat4, MathTemp.tempVec4);

    const w = MathTemp.tempVec4.w;
    const nx = MathTemp.tempVec4.x / w;
    const ny = MathTemp.tempVec4.y / w;
    const nz = MathTemp.tempVec4.z / w;

    // Transform of coordinate axis.
    out.x = (nx + 1.0) * 0.5;
    out.y = (1.0 - ny) * 0.5;
    out.z = nz;
    out.w = w;
    return out;
  }

  /**
   * Transform a point from viewport space to world space.
   * @param point - Point in viewport sapce, X and Y are the viewport space coordinates, Z is the viewport depth. The near clipping plane is 0, and the far clipping plane is 1
   * @param out - Point in world space
   * @returns Point in world space
   */
  viewportToWorldPoint(point: Vector3, out: Vector3): Vector3 {
    const invViewProjMat = this.invViewProjMat;
    return this._innerViewportToWorldPoint(point, invViewProjMat, out);
  }

  /**
   * Generate a ray by a point in viewport.
   * @param point - Point in viewport space, which is represented by normalization
   * @param out - Ray
   * @returns Ray
   */
  viewportPointToRay(point: Vector2, out: Ray): Ray {
    const clipPoint = MathTemp.tempVec3;
    // Use the intersection of the near clipping plane as the origin point.
    clipPoint.setValue(point.x, point.y, 0);
    const origin = this.viewportToWorldPoint(clipPoint, out.origin);
    // Use the intersection of the far clipping plane as the origin point.
    clipPoint.z = 1.0;
    const farPoint: Vector3 = this._innerViewportToWorldPoint(clipPoint, this._invViewProjMat, clipPoint);
    Vector3.subtract(farPoint, origin, out.direction);
    out.direction.normalize();

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
    return out;
  }

  /**
   * Transform a point from world space to screen space.
   * @param point - Point in world space
   * @param out - Point of screen space
   * @returns Point of screen space
   */
  worldToScreenPoint(point: Vector3, out: Vector4): Vector4 {
    this.worldToViewportPoint(point, out);
    return this.viewportToScreenPoint(out, out);
  }

  /**
   * Transform a point from screen space to world space.
   * @param point - Screen space point
   * @param out - Point in world space
   * @returns Point in world space
   */
  screenToWorldPoint(point: Vector3, out: Vector3): Vector3 {
    this.screenToViewportPoint(point, out);
    return this.viewportToWorldPoint(out, out);
  }

  /**
   * Generate a ray by a point in screen.
   * @param point - Point in screen space, the unit is pixel
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
   * @param mipLevel - Set mip level the data want to wirte
   */
  render(cubeFace?: TextureCubeFace, mipLevel: number = 0): void {
    // compute cull frustm.
    const context = this.engine._renderContext;
    context._setContext(this);
    if (this.enableFrustumCulling && (this._frustumViewChangeFlag.flag || this._isFrustumProjectDirty)) {
      this._frustum.calculateFromMatrix(context._viewProjectMatrix);
      this._frustumViewChangeFlag.flag = false;
      this._isFrustumProjectDirty = false;
    }

    this._updateShaderData(context);

    // union scene and camera macro.
    ShaderMacroCollection.unionCollection(
      this.scene.shaderData._macroCollection,
      this.shaderData._macroCollection,
      this._globalShaderMacro
    );

    this._renderPipeline.render(context, cubeFace, mipLevel);
    this._engine._renderCount++;
  }

  /**
   * @override
   * @inheritdoc
   */
  _onActive() {
    this.entity.scene._attachRenderCamera(this);
  }

  /**
   * @override
   * @inheritdoc
   */
  _onInActive() {
    this.entity.scene._detachRenderCamera(this);
  }

  /**
   * @override
   * @inheritdoc
   */
  _onDestroy() {
    this._renderPipeline?.destroy();
    this._isInvViewProjDirty.destroy();
    this._isViewMatrixDirty.destroy();
    this.shaderData._addRefCount(-1);
  }

  private _projMatChange() {
    this._isFrustumProjectDirty = true;
    this._isProjectionDirty = true;
    this._isInvProjMatDirty = true;
    this._isInvViewProjDirty.flag = true;
  }

  private _innerViewportToWorldPoint(point: Vector3, invViewProjMat: Matrix, out: Vector3): Vector3 {
    // Depth is a normalized value, 0 is nearPlane, 1 is farClipPlane.
    const depth = point.z * 2 - 1;
    // Transform to clipping space matrix
    const clipPoint = MathTemp.tempVec4;
    clipPoint.setValue(point.x * 2 - 1, 1 - point.y * 2, depth, 1);
    Vector4.transform(clipPoint, invViewProjMat, clipPoint);
    const invW = 1.0 / clipPoint.w;
    out.x = clipPoint.x * invW;
    out.y = clipPoint.y * invW;
    out.z = clipPoint.z * invW;
    return out;
  }

  private _updateShaderData(context: RenderContext) {
    const shaderData = this.shaderData;
    shaderData.setMatrix(Camera._viewMatrixProperty, this.viewMatrix);
    shaderData.setMatrix(Camera._projectionMatrixProperty, this.projectionMatrix);
    shaderData.setMatrix(Camera._vpMatrixProperty, context._viewProjectMatrix);
    shaderData.setMatrix(Camera._inverseViewMatrixProperty, this._transform.worldMatrix);
    shaderData.setMatrix(Camera._inverseProjectionMatrixProperty, this.inverseProjectionMatrix);
    shaderData.setVector3(Camera._cameraPositionProperty, this._transform.worldPosition);
  }

  /**
   * @private
   * The inverse matrix of view projection matrix.
   */
  get invViewProjMat(): Matrix {
    if (this._isInvViewProjDirty.flag) {
      this._isInvViewProjDirty.flag = false;
      Matrix.multiply(this._transform.worldMatrix, this.inverseProjectionMatrix, this._invViewProjMat);
    }
    return this._invViewProjMat;
  }

  /**
   * @private
   * The inverse of the projection matrix.
   */
  get inverseProjectionMatrix(): Readonly<Matrix> {
    if (this._isInvProjMatDirty) {
      this._isInvProjMatDirty = false;
      Matrix.invert(this.projectionMatrix, this._inverseProjectionMatrix);
    }
    return this._inverseProjectionMatrix;
  }
}
