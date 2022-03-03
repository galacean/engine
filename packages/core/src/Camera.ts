import { BoundingFrustum, MathUtil, Matrix, Quaternion, Ray, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { Logger } from "./base";
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

  /**
   * Compute the inverse of the rotation translation matrix.
   * @param rotation - The rotation used to calculate matrix
   * @param translation - The translation used to calculate matrix
   * @param out - The calculated matrix
   */
  private static _rotationTranslationInv(rotation: Quaternion, translation: Vector3, out: Matrix) {
    const oe = out.elements;
    const { x, y, z, w } = rotation;
    let x2 = x + x;
    let y2 = y + y;
    let z2 = z + z;

    let xx = x * x2;
    let xy = x * y2;
    let xz = x * z2;
    let yy = y * y2;
    let yz = y * z2;
    let zz = z * z2;
    let wx = w * x2;
    let wy = w * y2;
    let wz = w * z2;

    oe[0] = 1 - (yy + zz);
    oe[1] = xy + wz;
    oe[2] = xz - wy;
    oe[3] = 0;

    oe[4] = xy - wz;
    oe[5] = 1 - (xx + zz);
    oe[6] = yz + wx;
    oe[7] = 0;

    oe[8] = xz + wy;
    oe[9] = yz - wx;
    oe[10] = 1 - (xx + yy);
    oe[11] = 0;

    oe[12] = translation.x;
    oe[13] = translation.y;
    oe[14] = translation.z;
    oe[15] = 1;

    out.invert();
  }

  /** Shader data. */
  readonly shaderData: ShaderData = new ShaderData(ShaderDataGroup.Camera);

  /** Rendering priority - A Camera with higher priority will be rendered on top of a camera with lower priority. */
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
   * @remarks Support bit manipulation, corresponding to Entity's layer.
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
   * Near clip plane - the closest point to the camera when rendering occurs.
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
   * The camera's view angle. activating when camera use perspective projection.
   */
  get fieldOfView(): number {
    return this._fieldOfView;
  }

  set fieldOfView(value: number) {
    this._fieldOfView = value;
    this._projMatChange();
  }

  /**
   * Aspect ratio. The default is automatically calculated by the viewport's aspect ratio. If it is manually set,
   * the manual value will be kept. Call resetAspectRatio() to restore it.
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
    if (this._isViewMatrixDirty.flag) {
      this._isViewMatrixDirty.flag = false;
      // Ignore scale.
      Camera._rotationTranslationInv(this._transform.worldRotationQuaternion, this._transform.worldPosition, this._viewMatrix);
    }
    return this._viewMatrix;
  }

  /**
   * The projection matrix is ​​calculated by the relevant parameters of the camera by default.
   * If it is manually set, the manual value will be maintained. Call resetProjectionMatrix() to restore it.
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
    console.log("not implementation");
    return false;
  }

  set enableHDR(value: boolean) {
    console.log("not implementation");
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
   * @param out - Point in viewport space, X and Y are the camera viewport space coordinates, Z is in world space units from the plane that camera forward is normal to
   * @returns Point in viewport space
   */
  worldToViewportPoint(point: Vector3, out: Vector3): Vector3 {
    const cameraPoint = MathTemp.tempVec3;
    const viewportPoint = MathTemp.tempVec4;

    Vector3.transformCoordinate(point, this.viewMatrix, cameraPoint);
    Vector3.transformToVec4(cameraPoint, this.projectionMatrix, viewportPoint);

    const w = viewportPoint.w;
    out.setValue((viewportPoint.x / w + 1.0) * 0.5, (1.0 - viewportPoint.y / w) * 0.5, -cameraPoint.z);
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
    const direction = this._innerViewportToWorldPoint(point.x, point.y, 1.0, invViewProjMat, out.direction);
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
   * @param point - Point in world space
   * @param out - Point of screen space
   * @returns Point of screen space
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
    // compute cull frustum.
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
      this.scene._globalShaderMacro,
      this.shaderData._macroCollection,
      this._globalShaderMacro
    );

    if (mipLevel > 0 && !this.engine._hardwareRenderer.isWebGL2) {
      mipLevel = 0;
      Logger.error("mipLevel only take effect in WebGL2.0");
    }
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

  private _innerViewportToWorldPoint(x: number, y: number, z: number, invViewProjMat: Matrix, out: Vector3): Vector3 {
    // Depth is a normalized value, 0 is nearPlane, 1 is farClipPlane.
    // Transform to clipping space matrix
    const clipPoint = MathTemp.tempVec3;
    clipPoint.setValue(x * 2 - 1, 1 - y * 2, z * 2 - 1);
    Vector3.transformCoordinate(clipPoint, invViewProjMat, out);
    return out;
  }

  private _updateShaderData(context: RenderContext): void {
    const shaderData = this.shaderData;
    shaderData.setMatrix(Camera._viewMatrixProperty, this.viewMatrix);
    shaderData.setMatrix(Camera._projectionMatrixProperty, this.projectionMatrix);
    shaderData.setMatrix(Camera._vpMatrixProperty, context._viewProjectMatrix);
    shaderData.setMatrix(Camera._inverseViewMatrixProperty, this._transform.worldMatrix);
    shaderData.setMatrix(Camera._inverseProjectionMatrixProperty, this._getInverseProjectionMatrix());
    shaderData.setVector3(Camera._cameraPositionProperty, this._transform.worldPosition);
  }

  /**
   * The inverse matrix of view projection matrix.
   */
  private _getInvViewProjMat(): Matrix {
    if (this._isInvViewProjDirty.flag) {
      this._isInvViewProjDirty.flag = false;
      Matrix.multiply(this._transform.worldMatrix, this._getInverseProjectionMatrix(), this._invViewProjMat);
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
}
