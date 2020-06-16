import { ClearMode } from "@alipay/o3-base";
import { Node, NodeAbility } from "@alipay/o3-core";
import { mat4, MathUtil, vec3, vec4 } from "@alipay/o3-math";
import { BasicSceneRenderer } from "@alipay/o3-renderer-basic";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";

// type 修改//CM：放到公共的数学库文件
type Vector2 = [number, number];
type Vector3 = [number, number, number];
type Vector4 = [number, number, number, number];
type Matrix4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

type Ray = { origin: Vector3; direction: Vector3 }; //CM:直接实现一个类吧
type Sky = {}; //CM:直接实现一个类吧

//CM：放到公共的数学库文件
class MathTemp {
  static tempMat4 = mat4.create() as Matrix4;
  static tempVec4 = vec4.create() as Vector4;
  static tempVec3 = vec3.create() as Vector3;
}

/**
 * 清理参数
 */
enum ClearFlags { //CM：编写正式注释
  DepthSky, // 只保留天空盒
  DepthColor, // 纯色
  Depth, // 只清除深度信息
  None // 不做任何清除
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

/**
 * Camera 组件，作为渲染三位世界的入口。
 */
export class Camera extends NodeAbility {
  /**
   * 渲染优先级，数字越大越先渲染。
   */
  public priority: number = 0;
  /**
   * 渲染遮罩，位操作。
   * @todo 渲染管线剔除管理实现
   */
  public cullingMask: number = 0;

  private _isOrthographic: boolean = false;
  private _projectionMatrix: Matrix4 = mat4.create() as Matrix4;
  private _isProjectionDirty = false; //CM:可进一步区分透视和正交的dirty
  private _isProjMatSetting = false;
  private _viewMatrix: Matrix4 = mat4.create() as Matrix4;
  private _clearFlags: ClearFlags;
  private _clearParam: Vector4;
  private _clearMode: ClearMode;
  private _sceneRenderer: BasicSceneRenderer;
  private _viewportNormalized: Vector4 = vec4.create() as Vector4;
  private _viewport: Vector4 = [0, 0, 1, 1];
  private _nearClipPlane: number;
  private _farClipPlane: number;
  private _fieldOfView: number;
  private _orthographicSize: number = 10;
  private _inverseProjectionMatrix: Matrix4 = mat4.create() as Matrix4;
  private _inverseViewMatrix: Matrix4 = mat4.create() as Matrix4;
  private _shouldInvProjMatUpdate: boolean = false;
  // todo:监听 node transform 修改设为 true
  private _shouldViewMatUpdate: boolean = true;
  private _customAspectRatio: number = undefined;

  /**
   * 近裁剪平面。
   */
  public get nearClipPlane(): number {
    return this._nearClipPlane;
  }

  public set nearClipPlane(value: number) {
    this._nearClipPlane = value;
    this._isProjectionDirty = true;
  }

  /**
   * 远裁剪平面。
   */
  public get farClipPlane(): number {
    return this._farClipPlane;
  }

  public set farClipPlane(value: number) {
    this._farClipPlane = value;
    this._isProjectionDirty = true;
  }

  /**
   * 视场，单位是角度制，透视投影时生效。
   */
  public get fieldOfView(): number {
    return this._fieldOfView;
  }

  public set fieldOfView(value: number) {
    this._fieldOfView = value;
    this._isProjectionDirty = true;
  }

  /**
   * 横纵比，默认由视口的宽高比自动计算，如果手动设置会保持手动值，调用resetAspectRatio()可恢复。
   */
  public get aspectRatio(): number {
    return this._customAspectRatio ?? this._viewport[2] / this._viewport[3];
  }

  public set aspectRatio(value: number) {
    this._customAspectRatio = value;
    this._isProjectionDirty = true;
  }

  /**
   * 归一化视口，左上角为（0，0）坐标，右下角为（1，1）。
   * @todo 目前为兼容旧接口，以后修改为归一化的 viewport
   */
  public get viewport(): Readonly<Vector4> {
    return this._viewport;
  }

  public set viewport(value: Readonly<Vector4>) {
    throw "Not implemented.";
  }

  /**
   * 是否正交，默认是 false。true 会使用正交投影，false 使用透视投影。
   */
  public get isOrthographic(): boolean {
    return this._isOrthographic;
  }

  public set isOrthographic(value: boolean) {
    this._isOrthographic = value;
    this._isProjectionDirty = true;
  }

  /**
   * 正交模式下相机的一半尺寸。
   */
  public get orthographicSize(): number {
    return this._orthographicSize;
  }

  public set orthographicSize(value: number) {
    this._orthographicSize = value;
    this._isProjectionDirty = true;
  }

  /**
   * 背景清除标记。
   */
  get clearFlags(): ClearFlags {
    return this._clearFlags;
  }
  set clearFlags(value: ClearFlags) {
    //CM:非sky模式目前可以实现
  }

  /**
   * 清楚视口的背景颜色，当 clearFlags 为 DepthColor 时生效。
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
    // todo:监听 node 的 transform 变换
    if (this._shouldViewMatUpdate) {
      const modelMatrix = this.node.getModelMatrix(); //CM：等木鳐做好改成直接调用transform的方法
      // todo:以后删除  turnAround
      turnAround(MathTemp.tempMat4, modelMatrix);
      mat4.invert(this._viewMatrix, MathTemp.tempMat4);
    }
    return this._viewMatrix;
  }

  /**
   * 投影矩阵,默认由相机的相关参数计算计算，如果手动设置会保持手动值，调用resetProjectionMatrix()可恢复。
   * @todo CM:测试深度标准,并🈯️深度标准
   */
  public set projectionMatrix(value: Matrix4) {
    this._projectionMatrix = value;
    this._isProjMatSetting = true;
    this._shouldInvProjMatUpdate = true;
  }

  public get projectionMatrix(): Matrix4 {
    if (!this._isProjectionDirty || this._isProjMatSetting) {
      return this._projectionMatrix;
    }
    this._isProjectionDirty = false;
    this._shouldInvProjMatUpdate = true;
    const aspectRatio = this.aspectRatio;
    if (!this._isOrthographic) {
      mat4.perspective(
        this._projectionMatrix,
        MathUtil.toRadian(this.fieldOfView),
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
    throw new Error("接口未实现");
  }

  public set enableHDR(value: boolean) {
    throw new Error("接口未实现");
  }

  /**
   * 渲染目标，设置后会渲染到渲染目标上，如果为空则渲染到屏幕上。
   * @todo 渲染管线修改
   */
  public get renderTarget(): never {
    throw new Error("接口未实现");
  }

  public set renderTarget(value: never) {
    throw new Error("接口未实现");
  }

  /**
   * 创建 Camera 组件。
   * @param node 节点
   * @param props camera 参数
   */
  constructor(node: Node, props: any) {
    // todo 修改构造函数参数
    super(node, props);
    const { SceneRenderer, canvas, attributes, clearParam, clearMode, near, far, fov } = props;
    const engine = this.engine;
    if (this.node.scene) {
      // todo 合并陆庄代码修改
      this.node.scene.attachRenderCamera(this as any);
    }

    this.nearClipPlane = near ?? 0.1;
    this.farClipPlane = far ?? 100;
    this.fieldOfView = fov ?? 45;

    this.viewportNormalized = [0, 0, 1, 1];

    // 兼容旧 camera
    const target = props.target || [0, 0, 0];
    const up = props.up || [0, 1, 0];
    node.position = props.position || [0, 10, 20];
    node.lookAt(target, up);

    const settingCanvas = engine?.config?.canvas ?? canvas;
    const settingAttribute = engine?.config?.attributes ?? attributes ?? {};
    const Renderer = SceneRenderer ?? BasicSceneRenderer;

    settingCanvas && this.attachToScene(settingCanvas, settingAttribute);
    this._sceneRenderer = new Renderer(this);

    this.setClearMode(clearMode, clearParam);
  }

  /**
   * 恢复通过 fieldOfView、nearClipPlane 和 farClipPlane 自动计算投影矩阵。
   */
  public resetProjectionMatrix() {
    this._isProjMatSetting = false;
    this._isProjectionDirty = true;
  }

  /**
   * 恢复通过视口宽高比自动计算横纵比。
   */
  public resetAspectRatio(): void {
    this._customAspectRatio = undefined;
    this._isProjectionDirty = true;
  }

  /**
   * 将一个点从世界空间变换到视口空间。
   * @param point - 世界空间中的点
   * @param out - X和Y为视口空间坐标，Z为视口深度，近裁剪面为0，远裁剪面为1，W为距离相机的世界单位距离 @todo //CM:需要验证深度范围
   * @returns X和Y为视口空间坐标，Z为视口深度，近裁剪面为0，远裁剪面为1，W为距离相机的世界单位距离
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
   * @param point - X和Y为视口空间坐标，Z为视口深度，近裁剪面为0，远裁剪面为1
   * @param out - 世界空间中的点
   * @returns 世界空间中的点
   */
  public viewportToWorldPoint(point: Vector3, out: Vector3): Vector3 {
    // const viewportLoc = vec3.fromValues(position[0] * 2 - 1, -(position[1] * 2 - 1), 0.0);
    const invViewMatrix = this.inverseViewMatrix;
    const invProjMatrix = this.inverseProjectionMatrix;
    const invMatViewProj = mat4.mul(MathTemp.tempMat4, invViewMatrix, invProjMatrix);

    // depth 是归一化的深度，0 是 nearPlane，1 是 farClipPlane
    const depth = point[2];
    // 变换到裁剪空间矩阵
    const viewportLoc = vec4.set(MathTemp.tempVec4, point[0] * 2 - 1, 1 - point[1] * 2, depth, 1);
    // 计算逆矩阵结果
    const u = vec4.transformMat4(MathTemp.tempVec4, viewportLoc, invMatViewProj);
    const w = u[3];

    out[0] = u[0] / w;
    out[1] = u[1] / w;
    out[2] = u[2] / w;
    return out;
  }

  /**
   * 通过视口空间点的坐标获取射线，生成射线的起点在相机的近裁面并穿过点的X和Y坐标。
   * @param point 视口空间中的点
   * @param out - 射线
   * @returns 射线
   */
  public viewportPointToRay(point: Vector2, out: Ray): Ray {
    // 使用近裁面的交点作为 origin
    vec3.set(MathTemp.tempVec3, point[0], point[1], 0.1);
    const origin = this.viewportToWorldPoint(MathTemp.tempVec3, out.origin);
    // 使用远裁面的交点作为 origin
    const viewportPos = vec3.set(MathTemp.tempVec3, point[0], point[1], 0.8); //CM:这个0.8是哈
    const worldPoint = this.viewportToWorldPoint(viewportPos, MathTemp.tempVec3);
    const direction = vec3.sub(out.direction, worldPoint, origin);
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
    const viewport = this.viewportNormalized;
    out[0] = (point[0] - viewport[0]) / viewport[2];
    out[1] = (point[1] - viewport[1]) / viewport[3];
    return out;
  }

  /**
   * 将一个点的X和Y坐标从视口空间变换到屏幕空间,Z坐标忽略。
   * @param point - 视口空间的点
   * @param out - 屏幕空间的点
   * @returns 射线
   */
  public viewportToScreenPoint<T extends Vector2 | Vector3 | Vector4>(point: T, out: T): T {
    const viewport = this.viewportNormalized;
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
   * 释放内部资源。
   */
  public destroy(): void {
    super.destroy();

    // -- remove from scene
    this._ownerNode.scene.detachRenderCamera(this as any);

    if (this._sceneRenderer) {
      this._sceneRenderer.destroy();
    }
  }

  /**
   * @private
   * 投影矩阵逆矩阵。
   */
  public get inverseProjectionMatrix(): Readonly<Matrix4> {
    // 触发更新
    const projectionMatrix = this.projectionMatrix;
    if (!this._shouldInvProjMatUpdate) {
      return this._inverseProjectionMatrix;
    }
    return mat4.invert(this._inverseProjectionMatrix, projectionMatrix);
  }

  /**
   * 相机视口，归一化的 viewport [0 - 1]。
   * @todo 删除兼容性API后修改为 viewport
   */
  public get viewportNormalized(): Readonly<Vector4> {
    return this._viewportNormalized;
  }

  public set viewportNormalized(v: Readonly<Vector4>) {
    const viewportNormalized = this._viewportNormalized;
    viewportNormalized[0] = v[0];
    viewportNormalized[1] = v[1];
    viewportNormalized[2] = v[2];
    viewportNormalized[3] = v[3];
    // todo rhi 修改
    if (this.renderHardware) {
      // todo 合并慎思：这里的宽高还可能是RenderTarget,如果设置了RenderTarget的话
      const canvas = this.renderHardware.canvas;
      const width = canvas.width;
      const height = canvas.height;

      const viewport = this._viewport;
      viewport[0] = width * v[0];
      viewport[1] = height * v[1];
      viewport[2] = width * v[2];
      viewport[3] = height * v[3];
      this._isProjectionDirty = true;
      // todo 底层每帧会调用
      // this.renderHardware.viewport(this._viewport[0], this._viewport[1], this._viewport[2], this._viewport[3]);
    }
  }

  //-------------------------------------------------deprecated---------------------------------------------------
  /**
   * 兼容旧的 api。
   * @deprecated
   * */
  private _rhi: GLRenderHardware;

  /**
   * 渲染管线 todo 兼容。
   * @deprecated
   */
  public get sceneRenderer(): BasicSceneRenderer {
    return this._sceneRenderer;
  }

  /**
   * @deprecated
   * 视图矩阵逆矩阵。
   */
  public get inverseViewMatrix(): Readonly<Matrix4> {
    turnAround(this._inverseViewMatrix, this.node.getModelMatrix());
    return this._inverseViewMatrix;
  }

  /**
   * @deprecated
   * 摄像机的位置(World Space)
   * @member {mat4}
   * @readonly
   */
  public get eyePos() {
    return this.node.worldPosition;
  }

  /**
   * 兼容旧的 aspect
   * @deprecated
   */
  public get aspect(): number {
    return this.aspectRatio;
  }

  /**
   * @deprecated
   * @todo 涉及渲染管线修改 rhi.clearRenderTarget 方法
   * @param clearMode
   * @param clearParam
   */
  public setClearMode(
    clearMode: ClearMode = ClearMode.SOLID_COLOR,
    clearParam: number[] = [0.25, 0.25, 0.25, 1]
  ): void {
    this._clearMode = clearMode;
    this._clearParam = clearParam as Vector4;
    this._sceneRenderer.defaultRenderPass.clearParam = clearParam;
    this._sceneRenderer.defaultRenderPass.clearMode = clearMode;
  }

  /**
   * @deprecated
   * 兼容之前的 api
   */
  public attachToScene(canvas: HTMLCanvasElement | string, attributes?: WebGLContextAttributes): void {
    if (typeof canvas === "string") {
      canvas = document.getElementById(canvas) as HTMLCanvasElement;
    }
    this._ownerNode.scene.attachRenderCamera(this as any);
    const engine = this._ownerNode.scene.engine;
    this._rhi = engine.requireRHI((this._props as any).RHI ?? GLRenderHardware, canvas, {
      ...(this._props as any).attributes,
      ...attributes
    });
    // 触发 rhi viewport 设置
    this.updateSizes((this._props as any).pixelRatio ?? window.devicePixelRatio, canvas);
    // this.viewportNormalized = this.viewportNormalized;
  }

  /**
   * @deprecated
   * 兼容旧的 renderHardware
   */
  public get renderHardware(): GLRenderHardware {
    return this._rhi;
    // return this.engine.requireRHI(this.rhi.);
  }

  /**
   * @deprecated
   * 更新画布大小和透视矩阵
   * @param [pixelRatio=this.pixelRatio] 像素比率
   * @param
   */
  private updateSizes(pixelRatio: number, canvas: HTMLCanvasElement): void {
    const width = (canvas.clientWidth * pixelRatio) | 0;
    const height = (canvas.clientHeight * pixelRatio) | 0;

    canvas.width = width;
    canvas.height = height;
    this.viewportNormalized = this.viewportNormalized;
    // this.setPerspective(this.fov, width, height, this.near, this.far);
    // this.setViewport(0, 0, width, height);
  }
}
