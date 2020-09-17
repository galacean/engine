import { MathUtil, Matrix, Vector2, Vector3, Vector4 } from "@alipay/o3-math";
import { ClearMode } from "./base";
import { Component } from "./Component";
import { dependencies } from "./ComponentsDependencies";
import { Entity } from "./Entity";
import { BasicRenderPipeline } from "./RenderPipeline/BasicRenderPipeline";
import { TextureCubeFace } from "./texture/enums";
import { RenderTarget } from "./texture/RenderTarget";
import { Transform } from "./Transform";
import { UpdateFlag } from "./UpdateFlag";

/**
 * @todo 数学库改造
 */
type Ray = { origin: Vector3; direction: Vector3 };

/**
 * @todo
 */
type Sky = {};

//CM：这个类可能需要搬家
class MathTemp {
  static tempMat4 = new Matrix();
  static tempVec4 = new Vector4();
  static tempVec3 = new Vector3();
}

/**
 * 相机的清除标记。
 */
export enum ClearFlags {
  /* 清理深度和天空。*/
  DepthSky,
  /* 清理深度和颜色。*/
  DepthColor,
  /* 只清除深度。*/
  Depth,
  /* 不做任何清除。*/
  None
}

/**
 * Camera 组件，作为渲染三位世界的入口。
 */
@dependencies(Transform)
export class Camera extends Component {
  /**
   * 渲染优先级，数字越大越先渲染。
   */
  priority: number = 0;
  /**
   * 渲染遮罩，位操作。
   * @todo 渲染管线剔除管理实现
   */
  cullingMask: number = 0;
  _renderPipeline: BasicRenderPipeline;
  _pixelViewport: Vector4 = new Vector4(0, 0, 1, 1);
  private _isOrthographic: boolean = false;
  private _projectionMatrix: Matrix = new Matrix();
  private _isProjMatSetting = false;
  private _viewMatrix: Matrix = new Matrix();
  private _backgroundColor: Vector4 = new Vector4();
  private _clearMode: ClearMode = ClearMode.SOLID_COLOR;
  private _viewport: Vector4 = new Vector4(0, 0, 1, 1);
  private _nearClipPlane: number = 0.1;
  private _farClipPlane: number = 100;
  private _fieldOfView: number = 45;
  private _orthographicSize: number = 10;
  private _inverseProjectionMatrix: Matrix = new Matrix();
  private _inverseViewMatrix: Matrix = new Matrix();
  /** 投影矩阵脏标记 */
  private _isProjectionDirty = true;
  /** 投影矩阵逆矩阵脏标记 */
  private _isInvProjMatDirty: boolean = true;
  private _customAspectRatio: number | undefined = undefined;
  private _lastAspectSize: Vector2 = new Vector2(0, 0);
  private _invViewProjMat: Matrix = new Matrix();

  private _transform: Transform;
  private _isViewMatrixDirty: UpdateFlag;
  /** 投影视图矩阵逆矩阵脏标记 */
  private _isInvViewProjDirty: UpdateFlag;
  private _renderTarget: RenderTarget = null;

  /**
   * 近裁剪平面。
   */
  get nearClipPlane(): number {
    return this._nearClipPlane;
  }

  set nearClipPlane(value: number) {
    this._nearClipPlane = value;
    this._projMatChange();
  }

  /**
   * 远裁剪平面。
   */
  get farClipPlane(): number {
    return this._farClipPlane;
  }

  set farClipPlane(value: number) {
    this._farClipPlane = value;
    this._projMatChange();
  }

  /**
   * 视场，单位是角度制，透视投影时生效。
   */
  get fieldOfView(): number {
    return this._fieldOfView;
  }

  set fieldOfView(value: number) {
    this._fieldOfView = value;
    this._projMatChange();
  }

  /**
   * 横纵比，默认由视口的宽高比自动计算，如果手动设置会保持手动值，调用resetAspectRatio()可恢复。
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
   * 视口，归一化表达，左上角为（0，0）坐标，右下角为（1，1）。
   * @remarks 修改后需要重新赋值,保证修改生效。
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
   * 是否正交，默认是 false。true 会使用正交投影，false 使用透视投影。
   */
  get isOrthographic(): boolean {
    return this._isOrthographic;
  }

  set isOrthographic(value: boolean) {
    this._isOrthographic = value;
    this._projMatChange();
  }

  /**
   * 正交模式下相机的一半尺寸。
   */
  get orthographicSize(): number {
    return this._orthographicSize;
  }

  set orthographicSize(value: number) {
    this._orthographicSize = value;
    this._projMatChange();
  }

  /**
   * 背景清除标记。
   */
  get clearFlags(): ClearFlags {
    throw "not implemented";
  }

  /**
   * @todo 天空盒重构
   */
  set clearFlags(value: ClearFlags) {
    throw "not implemented";
  }

  /**
   * 清除视口的背景颜色，当 clearFlags 为 DepthColor 时生效。
   */
  get backgroundColor(): Vector4 {
    return this._backgroundColor;
  }

  set backgroundColor(value: Vector4) {
    this.setClearMode(this._clearMode, value);
  }

  /**
   * 清除视口的背景天空，当 clearFlags 为 DepthSky 时生效。
   * @todo 渲染管线修改
   */
  get backgroundSky(): Sky {
    throw new Error("接口未实现");
  }

  /**
   * 视图矩阵。
   */
  get viewMatrix(): Readonly<Matrix> {
    //CM:相机的视图矩阵一般会移除缩放,避免在shader运算出一些奇怪的问题
    if (this._isViewMatrixDirty.flag) {
      this._isViewMatrixDirty.flag = false;
      Matrix.invert(this._transform.worldMatrix, this._viewMatrix);
    }
    return this._viewMatrix;
  }

  /**
   * 投影矩阵,默认由相机的相关参数计算计算，如果手动设置会保持手动值，调用resetProjectionMatrix()可恢复。
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
   * 是否开启HDR。
   * @todo 渲染管线修改
   */
  get enableHDR(): boolean {
    throw new Error("not implemention");
  }

  set enableHDR(value: boolean) {
    throw new Error("not implemention");
  }

  /**
   * 渲染目标，设置后会渲染到渲染目标上，如果为空则渲染到屏幕上。
   */
  get renderTarget(): RenderTarget | null {
    return this._renderTarget;
  }

  set renderTarget(value: RenderTarget | null) {
    this._renderTarget = value;
  }

  /**
   * 创建 Camera 组件。
   * @param entity 实体
   * @param props camera 参数
   */
  constructor(entity: Entity, { RenderPipeline }) {
    super(entity);

    this._transform = this.entity.transform;
    this._isViewMatrixDirty = this._transform.registerWorldChangeFlag();
    this._isInvViewProjDirty = this._transform.registerWorldChangeFlag();

    RenderPipeline = RenderPipeline ?? BasicRenderPipeline;
    this._renderPipeline = new RenderPipeline(this);

    // 默认设置
    this.setClearMode();
  }

  /**
   * 恢复通过 fieldOfView、nearClipPlane 和 farClipPlane 自动计算投影矩阵。
   */
  resetProjectionMatrix(): void {
    this._isProjMatSetting = false;
    this._projMatChange();
  }

  /**
   * 恢复通过视口宽高比自动计算横纵比。
   */
  resetAspectRatio(): void {
    this._customAspectRatio = undefined;
    this._projMatChange();
  }

  /**
   * 将一个点从世界空间变换到视口空间。
   * @param point - 世界空间中的点
   * @param out - 视口空间坐标，X 和 Y 为视口空间坐标，Z 为视口深度，近裁剪面为 0，远裁剪面为 1，W 为距离相机的世界单位距离
   * @returns 视口空间坐标
   */
  worldToViewportPoint(point: Vector3, out: Vector4): Vector4 {
    Matrix.multiply(this.projectionMatrix, this.viewMatrix, MathTemp.tempMat4);
    MathTemp.tempVec4.setValue(point.x, point.y, point.z, 1.0);
    Vector4.transform(MathTemp.tempVec4, MathTemp.tempMat4, MathTemp.tempVec4);

    const w = MathTemp.tempVec4.w;
    const nx = MathTemp.tempVec4.x / w;
    const ny = MathTemp.tempVec4.y / w;
    const nz = MathTemp.tempVec4.z / w;

    // 坐标轴转换
    out.x = (nx + 1.0) * 0.5;
    out.y = (1.0 - ny) * 0.5;
    out.z = nz;
    out.w = w;
    return out;
  }

  /**
   * 将一个点从视口空间变换到世界空间。
   * @param point - X 和 Y 为视口空间坐标，Z 为视口深度，近裁剪面为 0，远裁剪面为 1
   * @param out - 世界空间中的点
   * @returns 世界空间中的点
   */
  viewportToWorldPoint(point: Vector3, out: Vector3): Vector3 {
    const invViewProjMat = this.invViewProjMat;
    return this._innerViewportToWorldPoint(point, invViewProjMat, out);
  }

  /**
   * 通过视口空间点的坐标获取射线，生成射线的起点在相机的近裁面并穿过点的 X 和 Y 坐标。
   * @param point 视口空间中的点
   * @param out - 射线
   * @returns 射线
   */
  viewportPointToRay(point: Vector2, out: Ray): Ray {
    const clipPoint = MathTemp.tempVec3;
    // 使用近裁面的交点作为 origin
    clipPoint.setValue(point.x, point.y, 0);
    const origin = this.viewportToWorldPoint(clipPoint, out.origin);
    // 使用远裁面的交点作为 origin
    clipPoint.z = 1.0;
    const farPoint: Vector3 = this._innerViewportToWorldPoint(clipPoint, this._invViewProjMat, clipPoint);
    Vector3.subtract(farPoint, origin, out.direction);
    out.direction.normalize();

    return out;
  }

  /**
   * 将一个点的X和Y坐标从屏幕空间变换到视口空间
   * @param point - 屏幕空间点
   * @param out - 视口空间点
   * @returns 射线
   */
  screenToViewportPoint<T extends Vector2 | Vector3>(point: Vector3 | Vector2, out: T): T {
    const viewport = this.viewport;
    out.x = (point.x - viewport.x) / viewport.z;
    out.y = (point.y - viewport.y) / viewport.w;
    return out;
  }

  /**
   * 将一个点的X和Y坐标从视口空间变换到屏幕空间。
   * @param point - 视口空间的点
   * @param out - 屏幕空间的点
   * @returns 射线
   */
  viewportToScreenPoint<T extends Vector2 | Vector3 | Vector4>(point: T, out: T): T {
    const viewport = this.viewport;
    const viewWidth = viewport.z;
    const viewHeight = viewport.w;
    const nx = point.x;
    const ny = point.y;
    out.x = viewport.x + viewWidth * nx;
    out.y = viewport.y + viewHeight * ny;
    return out;
  }

  /**
   * 手动调用相机的渲染。
   * @param cubeFaces - 立方体的渲染面集合,如果设置了renderTarget并且renderTarget.isCube=true时生效
   */
  render(cubeFaces?: TextureCubeFace): void {
    this._renderPipeline.render();
  }

  /**
   * @innernal
   */
  _onActive() {
    this.entity.scene.attachRenderCamera(this);
  }

  /**
   * @innernal
   */
  _onInActive() {
    this.entity.scene.detachRenderCamera(this);
  }

  /**
   * @innernal
   */
  _onDestroy() {
    this._renderPipeline?.destroy();
    this._isInvViewProjDirty.destroy();
    this._isViewMatrixDirty.destroy();
  }

  private _projMatChange() {
    this._isProjectionDirty = true;
    this._isInvProjMatDirty = true;
    this._isInvViewProjDirty.flag = true;
  }

  private _innerViewportToWorldPoint(point: Vector3, invViewProjMat: Matrix, out: Vector3): Vector3 {
    // depth 是归一化的深度，0 是 nearPlane，1 是 farClipPlane
    const depth = point.z * 2 - 1;
    // 变换到裁剪空间矩阵
    const clipPoint = MathTemp.tempVec4;
    clipPoint.setValue(point.x * 2 - 1, 1 - point.y * 2, depth, 1);
    Vector4.transform(clipPoint, invViewProjMat, clipPoint);
    const invW = 1.0 / clipPoint.w;
    out.x = clipPoint.x * invW;
    out.y = clipPoint.y * invW;
    out.z = clipPoint.z * invW;
    return out;
  }

  /**
   * @private
   * 视图投影矩阵逆矩阵
   */
  get invViewProjMat(): Matrix {
    if (this._isInvViewProjDirty.flag) {
      this._isInvViewProjDirty.flag = false;
      Matrix.multiply(this.inverseViewMatrix, this.inverseProjectionMatrix, this._invViewProjMat);
    }
    return this._invViewProjMat;
  }

  /**
   * @private
   * 投影矩阵逆矩阵。
   */
  get inverseProjectionMatrix(): Readonly<Matrix> {
    if (this._isInvProjMatDirty) {
      this._isInvProjMatDirty = false;
      Matrix.invert(this.projectionMatrix, this._inverseProjectionMatrix);
    }
    return this._inverseProjectionMatrix;
  }

  //-------------------------------------------------deprecated---------------------------------------------------

  /**
   * @deprecated
   * 视图矩阵逆矩阵。
   */
  get inverseViewMatrix(): Readonly<Matrix> {
    this._transform.worldMatrix.cloneTo(this._inverseViewMatrix);
    return this._inverseViewMatrix;
  }

  /**
   * @deprecated
   * @todo 涉及渲染管线修改 rhi.clearRenderTarget 方法
   * @param clearMode
   * @param backgroundColor
   */
  setClearMode(
    clearMode: ClearMode = ClearMode.SOLID_COLOR,
    backgroundColor: Vector4 = new Vector4(0.25, 0.25, 0.25, 1)
  ): void {
    this._clearMode = clearMode;
    this._backgroundColor = backgroundColor;
    this._renderPipeline.defaultRenderPass.clearParam = backgroundColor;
    this._renderPipeline.defaultRenderPass.clearMode = clearMode;
  }
}
