import { ClearMode } from "@alipay/o3-base";
import { mat4, MathUtil, vec3, vec4 } from "@alipay/o3-math";
import { Matrix4, Vector2, Vector3, Vector4 } from "@alipay/o3-math/types/type";
import { Component } from "./Component";
import { dependencies } from "./ComponentsDependencies";
import { Entity } from "./Entity";
import { BasicRenderPipeline } from "./RenderPipeline/BasicRenderPipeline";
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
  static tempMat4 = mat4.create() as Matrix4;
  static tempVec4 = vec4.create() as Vector4;
  static tempVec3 = vec3.create() as Vector3;
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
  public priority: number = 0;
  /**
   * 渲染遮罩，位操作。
   * @todo 渲染管线剔除管理实现
   */
  public cullingMask: number = 0;

  _pixelViewport: Vector4 = [0, 0, 1, 1];

  private _isOrthographic: boolean = false;
  private _projectionMatrix: Matrix4 = mat4.create();
  private _isProjMatSetting = false;
  private _viewMatrix: Matrix4 = mat4.create();
  private _clearFlags: ClearFlags;
  private _clearParam: Vector4;
  private _clearMode: ClearMode;
  private _sceneRenderer: any;
  private _viewport: Vector4 = [0, 0, 1, 1];
  private _nearClipPlane: number;
  private _farClipPlane: number;
  private _fieldOfView: number;
  private _orthographicSize: number = 10;
  private _inverseProjectionMatrix: Matrix4 = mat4.create();
  private _inverseViewMatrix: Matrix4 = mat4.create();
  /** 投影矩阵脏标记 */
  private _isProjectionDirty = true;
  /** 投影矩阵逆矩阵脏标记 */
  private _isInvProjMatDirty: boolean = true;
  private _customAspectRatio: number = undefined;
  private _invViewProjMat: Matrix4 = mat4.create();
  private _transform: Transform;
  private _isViewMatrixDirty: UpdateFlag;
  /** 投影视图矩阵逆矩阵脏标记 */
  private _isInvViewProjDirty: UpdateFlag;

  /**
   * 近裁剪平面。
   */
  public get nearClipPlane(): number {
    return this._nearClipPlane;
  }

  public set nearClipPlane(value: number) {
    this._nearClipPlane = value;
    this._projMatChange();
  }

  /**
   * 远裁剪平面。
   */
  public get farClipPlane(): number {
    return this._farClipPlane;
  }

  public set farClipPlane(value: number) {
    this._farClipPlane = value;
    this._projMatChange();
  }

  /**
   * 视场，单位是角度制，透视投影时生效。
   */
  public get fieldOfView(): number {
    return this._fieldOfView;
  }

  public set fieldOfView(value: number) {
    this._fieldOfView = value;
    this._projMatChange();
  }

  /**
   * 横纵比，默认由视口的宽高比自动计算，如果手动设置会保持手动值，调用resetAspectRatio()可恢复。
   */
  public get aspectRatio(): number {
    const canvas = this._entity.engine.canvas;
    return this._customAspectRatio ?? (canvas.width * this._viewport[2]) / (canvas.height * this._viewport[3]);
  }

  public set aspectRatio(value: number) {
    this._customAspectRatio = value;
    this._projMatChange();
  }

  /**
   * 视口，归一化表达，左上角为（0，0）坐标，右下角为（1，1）。
   * @remarks 修改后需要重新赋值,保证修改生效。
   */
  public get viewport(): Vector4 {
    return this._viewport;
  }

  public set viewport(value: Vector4) {
    if (value !== this._viewport) {
      vec4.copy(this._viewport, value);
    }
    this._projMatChange();
  }

  /**
   * 是否正交，默认是 false。true 会使用正交投影，false 使用透视投影。
   */
  public get isOrthographic(): boolean {
    return this._isOrthographic;
  }

  public set isOrthographic(value: boolean) {
    this._isOrthographic = value;
    this._projMatChange();
  }

  /**
   * 正交模式下相机的一半尺寸。
   */
  public get orthographicSize(): number {
    return this._orthographicSize;
  }

  public set orthographicSize(value: number) {
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
  public get backgroundColor(): Vector4 {
    return this._clearParam;
  }

  public set backgroundColor(value: Vector4) {
    this.setClearMode(this._clearMode, value);
  }

  /**
   * 清除视口的背景天空，当 clearFlags 为 DepthSky 时生效。
   * @todo 渲染管线修改
   */
  public get backgroundSky(): Sky {
    throw new Error("接口未实现");
  }

  /**
   * 视图矩阵。
   */
  public get viewMatrix(): Readonly<Matrix4> {
    //CM:相机的视图矩阵一般会移除缩放,避免在shader运算出一些奇怪的问题
    if (this._isViewMatrixDirty.flag) {
      this._isViewMatrixDirty.flag = false;
      const modelMatrix = this._transform.worldMatrix;
      turnAround(MathTemp.tempMat4, modelMatrix); // todo:以后删除  turnAround
      mat4.invert(this._viewMatrix, MathTemp.tempMat4);
    }
    return this._viewMatrix;
  }

  /**
   * 投影矩阵,默认由相机的相关参数计算计算，如果手动设置会保持手动值，调用resetProjectionMatrix()可恢复。
   */
  public set projectionMatrix(value: Matrix4) {
    this._projectionMatrix = value;
    this._isProjMatSetting = true;
    this._projMatChange();
  }

  public get projectionMatrix(): Matrix4 {
    if (!this._isProjectionDirty || this._isProjMatSetting) {
      return this._projectionMatrix;
    }
    this._isProjectionDirty = false;
    const aspectRatio = this.aspectRatio;
    if (!this._isOrthographic) {
      mat4.perspective(
        this._projectionMatrix,
        MathUtil.toRadian(this._fieldOfView),
        aspectRatio,
        this._nearClipPlane,
        this._farClipPlane
      );
    } else {
      const width = this._orthographicSize * aspectRatio;
      const height = this._orthographicSize;
      mat4.ortho(this._projectionMatrix, -width, width, -height, height, this._nearClipPlane, this._farClipPlane);
    }
    return this._projectionMatrix;
  }

  /**
   * 是否开启HDR。
   * @todo 渲染管线修改
   */
  public get enableHDR(): boolean {
    throw new Error("not implemention");
  }

  public set enableHDR(value: boolean) {
    throw new Error("not implemention");
  }

  /**
   * 渲染目标，设置后会渲染到渲染目标上，如果为空则渲染到屏幕上。
   * @todo 渲染管线修改
   */
  public get renderTarget(): any {
    throw new Error("not implemention");
  }

  public set renderTarget(value: any) {
    throw new Error("not implemention");
  }

  /**
   * 创建 Camera 组件。
   * @param node 节点
   * @param props camera 参数
   */
  constructor(node: Entity, props: any) {
    // TODO: 修改构造函数参数
    super(node, props);

    this._transform = this.entity.transform;
    this._isViewMatrixDirty = this._transform.registerWorldChangeFlag();
    this._isInvViewProjDirty = this._transform.registerWorldChangeFlag();
    const {
      RenderPipeline = BasicRenderPipeline,
      clearParam = [0.25, 0.25, 0.25, 1],
      clearMode,
      near,
      far,
      fov
    } = props;

    this._nearClipPlane = near ?? 0.1;
    this._farClipPlane = far ?? 100;
    this._fieldOfView = fov ?? 45;

    // TODO: 删除，兼容旧 camera，decaprated
    const target = props.target ?? [0, 0, 0];
    const up = props.up ?? [0, 1, 0];
    node.transform.position = props.position ?? [0, 10, 20];
    node.transform.lookAt(target, up);

    this._sceneRenderer = new RenderPipeline(this);

    // TODO: 修改为 ClearFlags
    this.setClearMode(clearMode, clearParam);
  }

  /**
   * 恢复通过 fieldOfView、nearClipPlane 和 farClipPlane 自动计算投影矩阵。
   */
  public resetProjectionMatrix(): void {
    this._isProjMatSetting = false;
    this._projMatChange();
  }

  /**
   * 恢复通过视口宽高比自动计算横纵比。
   */
  public resetAspectRatio(): void {
    this._customAspectRatio = undefined;
    this._projMatChange();
  }

  /**
   * 将一个点从世界空间变换到视口空间。
   * @param point - 世界空间中的点
   * @param out - 视口空间坐标，X 和 Y 为视口空间坐标，Z 为视口深度，近裁剪面为 0，远裁剪面为 1，W 为距离相机的世界单位距离
   * @returns 视口空间坐标
   */
  public worldToViewportPoint(point: Vector3, out: Vector4): Vector4 {
    const matViewProj = mat4.mul(MathTemp.tempMat4, this.projectionMatrix, this.viewMatrix);

    const worldPos = vec4.set(MathTemp.tempVec4, point[0], point[1], point[2], 1.0);
    const clipPos = vec4.transformMat4(MathTemp.tempVec4, worldPos, matViewProj); //CM：可增加transformV3ToV4绕过worldPos转换的流程

    const w = clipPos[3];
    const nx = clipPos[0] / w;
    const ny = clipPos[1] / w;
    const nz = clipPos[2] / w;

    // 坐标轴转换
    out[0] = (nx + 1.0) * 0.5;
    out[1] = (1.0 - ny) * 0.5;
    out[2] = nz;
    out[3] = w;
    return out;
  }

  /**
   * 将一个点从视口空间变换到世界空间。
   * @param point - X 和 Y 为视口空间坐标，Z 为视口深度，近裁剪面为 0，远裁剪面为 1
   * @param out - 世界空间中的点
   * @returns 世界空间中的点
   */
  public viewportToWorldPoint(point: Vector3, out: Vector3): Vector3 {
    const invViewProjMat = this.invViewProjMat;
    return this._innerViewportToWorldPoint(point, invViewProjMat, out);
  }

  /**
   * 通过视口空间点的坐标获取射线，生成射线的起点在相机的近裁面并穿过点的 X 和 Y 坐标。
   * @param point 视口空间中的点
   * @param out - 射线
   * @returns 射线
   */
  public viewportPointToRay(point: Vector2, out: Ray): Ray {
    // 使用近裁面的交点作为 origin
    vec3.set(MathTemp.tempVec3, point[0], point[1], 0);
    const origin = this.viewportToWorldPoint(MathTemp.tempVec3, out.origin);
    // 使用远裁面的交点作为 origin
    const viewportPos = vec3.set(MathTemp.tempVec3, point[0], point[1], 1);
    const farPoint = this._innerViewportToWorldPoint(viewportPos, this._invViewProjMat, MathTemp.tempVec3);
    const direction = vec3.sub(out.direction, farPoint, origin);
    vec3.normalize(direction, direction);
    return out;
  }

  /**
   * 将一个点的X和Y坐标从屏幕空间变换到视口空间
   * @param point - 屏幕空间点
   * @param out - 视口空间点
   * @returns 射线
   */
  public screenToViewportPoint<T extends Vector2 | Vector3>(point: Vector3 | Vector2, out: T): T {
    const viewport = this.viewport;
    out[0] = (point[0] - viewport[0]) / viewport[2];
    out[1] = (point[1] - viewport[1]) / viewport[3];
    return out;
  }

  /**
   * 将一个点的X和Y坐标从视口空间变换到屏幕空间。
   * @param point - 视口空间的点
   * @param out - 屏幕空间的点
   * @returns 射线
   */
  public viewportToScreenPoint<T extends Vector2 | Vector3 | Vector4>(point: T, out: T): T {
    const viewport = this.viewport;
    const viewWidth = viewport[2];
    const viewHeight = viewport[3];
    const nx = point[0];
    const ny = point[1];
    out[0] = viewport[0] + viewWidth * nx;
    out[1] = viewport[1] + viewHeight * ny;
    return out;
  }

  /**
   * 手动调用相机的渲染。
   * @param cubeFaces 立方体的渲染面集合,如果设置了renderTarget并且renderTarget.isCube=true时生效
   */
  public render(cubeFaces?: number /*todo:修改为TextureCubeFace类型*/): void {
    this._sceneRenderer.render();
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
    this._sceneRenderer?.destroy();
    this._isInvViewProjDirty.destroy();
    this._isViewMatrixDirty.destroy();
  }

  private _projMatChange() {
    this._isProjectionDirty = true;
    this._isInvProjMatDirty = true;
    this._isInvViewProjDirty.flag = true;
  }

  private _innerViewportToWorldPoint(point: Vector3, invViewProjMat: Matrix4, out: Vector3) {
    // depth 是归一化的深度，0 是 nearPlane，1 是 farClipPlane
    const depth = point[2] * 2 - 1;
    // 变换到裁剪空间矩阵
    const clipPoint = vec4.set(MathTemp.tempVec4, point[0] * 2 - 1, 1 - point[1] * 2, depth, 1);
    // 计算逆矩阵结果
    const u = vec4.transformMat4(MathTemp.tempVec4, clipPoint, invViewProjMat);
    const w = u[3];

    out[0] = u[0] / w;
    out[1] = u[1] / w;
    out[2] = u[2] / w;
    return out;
  }

  /**
   * @private
   * 视图投影矩阵逆矩阵
   */
  public get invViewProjMat() {
    if (this._isInvViewProjDirty.flag) {
      this._isInvViewProjDirty.flag = false;
      const invViewMatrix = this.inverseViewMatrix;
      const invProjMatrix = this.inverseProjectionMatrix;
      mat4.mul(this._invViewProjMat, invViewMatrix, invProjMatrix);
    }
    return this._invViewProjMat;
  }

  /**
   * @private
   * 投影矩阵逆矩阵。
   */
  public get inverseProjectionMatrix(): Readonly<Matrix4> {
    if (this._isInvProjMatDirty) {
      this._isInvProjMatDirty = false;
      const projectionMatrix = this.projectionMatrix;
      mat4.invert(this._inverseProjectionMatrix, projectionMatrix);
    }
    return this._inverseProjectionMatrix;
  }

  //-------------------------------------------------deprecated---------------------------------------------------
  /**
   * 渲染管线 todo 兼容。
   * @deprecated
   */
  public get sceneRenderer(): any {
    return this._sceneRenderer;
  }

  /**
   * @deprecated
   * 视图矩阵逆矩阵。
   */
  public get inverseViewMatrix(): Readonly<Matrix4> {
    turnAround(this._inverseViewMatrix, this._transform.worldMatrix);
    return this._inverseViewMatrix;
  }

  /**
   * @deprecated
   * @todo 涉及渲染管线修改 rhi.clearRenderTarget 方法
   * @param clearMode
   * @param clearParam
   */
  public setClearMode(clearMode: ClearMode = ClearMode.SOLID_COLOR, clearParam: Vector4 = [0.25, 0.25, 0.25, 1]): void {
    this._clearMode = clearMode;
    this._clearParam = clearParam as Vector4;
    this._sceneRenderer.defaultRenderPass.clearParam = clearParam;
    this._sceneRenderer.defaultRenderPass.clearMode = clearMode;
  }
}

/**
 * @deprecated
 */
export function turnAround(out, a) {
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];

  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  out[3] = -a[3];
  out[8] = -a[8];
  out[9] = -a[9];
  out[10] = -a[10];
  out[11] = -a[11];
  return out;
}

interface ITransform {
  worldMatrix: Readonly<Matrix4>;
  worldPosition: Readonly<Vector3>;
}
