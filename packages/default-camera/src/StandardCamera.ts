import { NodeAbility } from "@alipay/o3-core";
import { mat4, vec4, vec3, MathUtil } from "@alipay/o3-math";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { BasicSceneRenderer } from "@alipay/o3-renderer-basic";
import { Mat4 } from "@alipay/o3-math/types/type";
import { ClearMode } from "@alipay/o3-base";
import { Node } from "@alipay/o3-core";

// 数学库
// 渲染管线
// 天空盒

// type 修改
type Vector2 = [number, number];
type Vector3 = [number, number, number];
type Vector4 = [number, number, number, number];
type Matrix4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

type Ray = { origin: Vector3; direction: Vector3 };
type Sky = {};

class MathTemp {
  static tempMat4 = mat4.create() as Matrix4;
  static tempVec4 = vec4.create() as Vector4;
  static tempVec3 = vec3.create() as Vector3;
}

enum ClearFlags {
  SKYBOX, // 只保留天空盒
  COLOR, // 纯色
  DEPTH_ONLY, // 只清除深度信息
  NONE // 不做任何清除
}

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

export class StandardCamera extends NodeAbility {
  /**
   * 设置优先级，数字越大渲染顺序越前
   * @todo scene._activeCameras
   */
  public priority: number = 0;
  /**
   * 渲染遮罩，位操作
   * @todo 渲染管线实现
   */
  public cullingMask: number = 0;

  private _isOrthographic: boolean = false;
  private _projectionMatrix: Matrix4 = mat4.create() as Matrix4;
  private _isProjectionDirty = false;
  private isProjectionMatrixSetting = false;
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
  private shouldInvProjMatUpdate: boolean = false;
  // todo 监听 node modelMatrix 修改设为 true
  private shouldViewMatrixUpdate: boolean = true;
  /**
   * 兼容旧的 api
   * @deprecated
   * */
  private _rhi: GLRenderHardware;
  private _customAspectRatio: number = undefined;

  /**
   * 视图矩阵
   */
  public get viewMatrix(): Readonly<Matrix4> {
    // todo 监听 node 的 transform 变换
    if (this.shouldViewMatrixUpdate) {
      const modelMatrix = this.node.getModelMatrix();
      // todo 删除  turnAround
      turnAround(MathTemp.tempMat4, modelMatrix);
      mat4.invert(this._viewMatrix, MathTemp.tempMat4);
    }
    return this._viewMatrix;
  }

  /**
   * @todo 测试深度标准
   * 设置投影矩阵
   */
  public set projectionMatrix(p: Matrix4) {
    this._projectionMatrix = p;
    this.isProjectionMatrixSetting = true;
    this.shouldInvProjMatUpdate = true;
  }

  /**
   * 投影矩阵
   */
  public get projectionMatrix(): Matrix4 {
    if (!this._isProjectionDirty || this.isProjectionMatrixSetting) {
      return this._projectionMatrix;
    }
    this._isProjectionDirty = false;
    this.shouldInvProjMatUpdate = true;
    const aspectRatio = this.aspectRatio;
    if (!this._isOrthographic) {
      mat4.perspective(this._projectionMatrix, MathUtil.toRadian(this.fieldOfView), aspectRatio, this.nearClipPlane, this.farClipPlane);
    } else {
      const width = this._orthographicSize * aspectRatio;
      const height = this._orthographicSize;
      mat4.ortho(this._projectionMatrix, -width, width, -height, height, this._nearClipPlane, this._farClipPlane);
    }
    return this._projectionMatrix;
  }

  /**
   * @private
   * 投影矩阵逆矩阵
   */
  public get inverseProjectionMatrix(): Readonly<Matrix4> {
    // 触发更新
    const projectionMatrix = this.projectionMatrix;
    if (!this.shouldInvProjMatUpdate) {
      return this._inverseProjectionMatrix;
    }
    return mat4.invert(this._inverseProjectionMatrix, projectionMatrix);
  }

  /**
   * 近裁剪平面
   */
  public set nearClipPlane(value: number) {
    this._nearClipPlane = value;
    this._isProjectionDirty = true;
  }

  /**
   * 近裁剪平面
   */
  public get nearClipPlane(): number {
    return this._nearClipPlane;
  }

  /**
   * 远裁剪平面
   */
  public get farClipPlane(): number {
    return this._farClipPlane;
  }

  /**
   * 远裁剪平面
   */
  public set farClipPlane(value: number) {
    this._farClipPlane = value;
    this._isProjectionDirty = true;
  }

  /**
   * 视角，透视投影时生效
   */
  public get fieldOfView(): number {
    return this._fieldOfView;
  }

  /**
   * 视角，透视投影时生效
   */
  public set fieldOfView(value: number) {
    this._fieldOfView = value;
    this._isProjectionDirty = true;
  }

  /**
   * 正交模式下相机的一半尺寸
   */
  public get orthographicSize(): number {
    return this._orthographicSize;
  }

  /**
   * 正交模式下相机的一半尺寸
   */
  public set orthographicSize(value: number) {
    this._orthographicSize = value;
    this._isProjectionDirty = true;
  }

  /**
   * 是否正交，默认是 false。true 会使用正交投影，false 使用透视投影
   */
  public get isOrthographic(): boolean {
    return this._isOrthographic;
  }

  /**
   * 是否正交，默认是 false。true 会使用正交投影，false 使用透视投影
   */
  public set isOrthographic(value: boolean) {
    this._isOrthographic = value;
    this._isProjectionDirty = true;
  }

  /**
   * 兼容旧的非归一化的 viewport
   * @todo 修改为归一化的 viewport
   */
  public get viewport(): Readonly<Vector4> {
    return this._viewport;
  }

  /**
   * 相机视口，归一化的 viewport [0 - 1]
   * @todo 修改为 viewport
   */
  public get viewportNormalized(): Readonly<Vector4> {
    return this._viewportNormalized;
  }

  /**
   * 相机视口，归一化的 viewport [0 - 1]
   * @todo 修改为 viewport
   */
  public set viewportNormalized(v: Readonly<Vector4>) {
    const viewportNormalized = this._viewportNormalized;
    viewportNormalized[0] = v[0];
    viewportNormalized[1] = v[1];
    viewportNormalized[2] = v[2];
    viewportNormalized[3] = v[3];
    // todo rhi 修改
    if (this.renderHardware) {
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

  /**
   * 视口宽高比，默认通过 viewport 计算
   */
  public get aspectRatio(): number {
    return this._customAspectRatio ?? this._viewport[2] / this._viewport[3];
  }

  /**
   * 手动设置视口宽高比，设置后则不通过 viewport 计算
   */
  public set aspectRatio(value: number) {
    this._customAspectRatio = value;
    this._isProjectionDirty = true;
  }

  /**
   * 清除背景颜色，当 clearFlags 为 SOLID_COLOR 时生效
   */
  public get backgroundColor(): Vector4 {
    return this._clearParam;
  }

  public set backgroundColor(value: Vector4) {
    this.setClearMode(this._clearMode, value);
  }

  /**
   * 清除天空，当 clearFlags 为 Sky 时生效
   * @todo 渲染管线修改
   */
  public get backgroundSky(): never {
    throw new Error("接口未实现");
  }

  /**
   * 是否开启HDR。
   * @todo 渲染管线修改
   */
  public get enableHDR(): never {
    throw new Error("接口未实现");
  }

  public set enableHDR(value: never) {
    throw new Error("接口未实现");
  }

  /**
   * renderTarget 渲染对象，可以设多 ColorTexture
   * @todo 渲染管线修改
   */
  public get renderTarget(): never {
    throw new Error("接口未实现");
    // return null;
  }

  public set renderTarget(value: never) {
    throw new Error("接口未实现");
  }

  /**
   * 创建 Camera 组件
   * @param node
   * @param props
   */
  constructor(node: Node, props: any) {
    super(node, props);
    const { SceneRenderer, canvas, attributes, clearParam, clearMode, near, far, fov } = props;
    const engine = this.engine;
    if (this.node.scene) {
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
   * 重置投影矩阵设置，让 fieldOfView，nearClipPlane 和 farClipPlane 生效
   */
  public resetProjectionMatrix() {
    this.isProjectionMatrixSetting = false;
    this._isProjectionDirty = true;
  }

  /**
   * 重置手动设置的视口宽高比
   */
  public resetAspectRatio(): void {
    this._customAspectRatio = undefined;
    this._isProjectionDirty = true;
  }

  /**
   * 世界坐标转换成屏幕坐标
   * @param worldPoint
   * @param out out[0] 是归一化的 screen 的 x，out[1] 是归一化的 screen 的 y，out[2] 是归一化的视口深度，0 是近裁面，1 是远裁面，out[3] 是距相机的深度
   */
  public worldToScreenPoint(worldPoint: Vector3, out: Vector4): Vector4 {
    this.worldToViewportPoint(worldPoint, out);
    return this.viewportToScreenPoint(out, out);
  }

  /**
   * 世界坐标转化成 viewport 坐标
   * @param worldPoint 世界坐标
   * @param out out[0] 是归一化的 viewport 的 x，out[1] 是归一化的 viewport 的 y，out[2] 是归一化的视口深度，0 是近裁面，1 是远裁面，out[3] 是距相机的深度
   */
  public worldToViewportPoint(worldPoint: Vector3, out: Vector4): Vector4 {
    const matViewProj = mat4.mul(MathTemp.tempMat4, this.projectionMatrix, this.viewMatrix);

    const worldPos = vec4.set(MathTemp.tempVec4, worldPoint[0], worldPoint[1], worldPoint[2], 1.0);
    const clipPos = vec4.transformMat4(MathTemp.tempVec4, worldPos, matViewProj);

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
   * 屏幕点转成射线
   * @param position
   */
  public screenPointToRay(position: Vector2, ray: Ray): Ray {
    const viewportPoint = this.viewportToScreenPoint(position, position);
    return this.viewportPointToRay(viewportPoint, ray);
  }

  /**
   * 屏幕坐标转化成视图坐标
   * @param position
   */
  public screenToViewportPoint<T extends Vector2 | Vector3>(position: Vector3 | Vector2, out: T): T {
    const viewport = this.viewportNormalized;
    out[0] = (position[0] - viewport[0]) / viewport[2];
    out[1] = (position[1] - viewport[1]) / viewport[3];
    return out;
  }

  /**
   * 屏幕坐标转化成世界坐标
   * @param position 屏幕坐标点，postion[0] 是归一化的 viewport 的 x，postion[1] 是归一化的 viewport 的 x，postion[2] 归一化的 z，0 是近裁面，1 是远裁面
   */
  public screenToWorldPoint(position: Vector3, out: Vector3): Vector3 {
    const viewportPoint = this.screenToViewportPoint(position, MathTemp.tempVec3);
    return this.viewportToWorldPoint(viewportPoint, out);
  }

  /**
   * 相机视口坐标转化成射线
   * @param position position[0] 是归一化的 viewport x，position[1] 是归一化的 viewport y
   */
  public viewportPointToRay(position: Vector2, ray: Ray): Ray {
    // todo 使用 transform 的 worldPosition
    const modelMatrix = this.node.getModelMatrix();
    // todo 使用近裁面的交点作为 origin
    const origin = vec3.set(ray.origin, modelMatrix[12], modelMatrix[13], modelMatrix[14]);
    const viewportPos = vec3.set(MathTemp.tempVec3, position[0], position[1], 0.5);
    const worldPoint = this.viewportToWorldPoint(viewportPos, MathTemp.tempVec3);
    const direction = vec3.sub(ray.direction, worldPoint, origin);
    vec3.normalize(direction, direction);
    return ray;
  }

  /**
   * 相机视口坐标转化成射线转化成世界坐标
   * @param position 视口坐标点，postion[0] 是归一化的 viewport 的 x，postion[1] 是归一化的 viewport 的 x，postion[2] 归一化的 z，0 是近裁面，1 是远裁面
   */
  public viewportToWorldPoint(position: Vector3, out: Vector3): Vector3 {
    // const viewportLoc = vec3.fromValues(position[0] * 2 - 1, -(position[1] * 2 - 1), 0.0);
    const invViewMatrix = this.inverseViewMatrix;
    const invProjMatrix = this.inverseProjectionMatrix;
    const invMatViewProj = mat4.mul(MathTemp.tempMat4, invViewMatrix, invProjMatrix);

    // depth 是归一化的深度，0 是 nearPlane，1 是 farClipPlane
    const depth = position[2];
    // 变换到裁剪空间矩阵
    const viewportLoc = vec4.set(MathTemp.tempVec4, position[0] * 2 - 1, 1 - position[1] * 2, depth, 1);
    // 计算逆矩阵结果
    const u = vec4.transformMat4(MathTemp.tempVec4, viewportLoc, invMatViewProj);
    const w = u[3];

    out[0] = u[0] / w;
    out[1] = u[1] / w;
    out[2] = u[2] / w;
    return out;
  }

  /**
   * 相机视口坐标转化成屏幕点
   * @param position
   */
  public viewportToScreenPoint<T extends Vector2 | Vector3 | Vector4>(position: T, out: T): T {
    const viewport = this.viewportNormalized;
    const viewWidth = viewport[2];
    const viewHeight = viewport[3];
    const nx = position[0];
    const ny = position[1];
    out[0] = viewport[0] + viewWidth * nx;
    out[1] = viewport[1] + viewHeight * ny;
    return out;
  }

  /**
   * 渲染场景
   * @todo 渲染管线修改
   */
  public render(faceIndex?: number): void {
    this._sceneRenderer.render();
  }

  /**
   * 释放内部资源
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
   * 渲染管线 todo 兼容
   * @deprecated
   */
  public get sceneRenderer(): BasicSceneRenderer {
    return this._sceneRenderer;
  }

  /**
   * @deprecated
   * 视图矩阵逆矩阵
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
  public setClearMode(clearMode: ClearMode = ClearMode.SOLID_COLOR, clearParam: number[] = [0.25, 0.25, 0.25, 1]): void {
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
