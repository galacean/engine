import { NodeAbility } from "./NodeAbility";
import { mat4, vec4, vec3 } from "@alipay/o3-math";
import { GLRenderHardware } from "./type";
import { BasicSceneRenderer } from "@alipay/o3-renderer-basic";
import { Mat4 } from "@alipay/o3-math/types/type";
import { ClearMode } from "@alipay/o3-base";
import { Node } from "./Node";

// 数学库
// 渲染管线
// 天空盒

// type 修改
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

type Ray = { origin: Vector3; direction: Vector3 };
type Sky = {};

enum ClearFlags {
  SKYBOX, // 只保留天空盒
  COLOR, // 纯色
  DEPTH_ONLY, // 只清除深度信息
  NONE // 不做任何清除
}
export class StandardCamera extends NodeAbility {
  /**
   * 是否是正交投影
   */
  public isOrthographic: boolean = false;
  /**
   * 设置优先级，数字越大渲染顺序越前
   * @todo scene._activeCameras
   */
  public priority: number = 0;
  // todo 类型修改
  private _projectionMatrix: Matrix4 = mat4.create() as Matrix4;
  private isProjectionDirty = false;
  private isProjectionMatrixSetting = false;
  // todo 类型修改
  private _viewMatrix: Matrix4 = mat4.create() as Matrix4;
  private _clearFlags: ClearFlags;
  // todo 类型修改
  private _clearParam: Vector4;
  private _sceneRenderer: BasicSceneRenderer;
  // todo 类型修改
  private _viewportNormalized: Vector4;
  private _viewport: Vector4 = [0, 0, 1, 1];
  private _near: number;
  private _far: number;
  private _fov: number;
  private _orthographicSize: number;
  private _inverseProjectionMatrix: Matrix4 = mat4.create() as Matrix4;
  private shouldInvProjMatUpdate: boolean = false;
  /**
   * 兼容旧的 api
   * @deprecated
   * */
  private _rhi: GLRenderHardware;
  private _aspectSetting: number = undefined;

  constructor(node: Node, props: any) {
    super(node, props);
    const { RHI, SceneRenderer, canvas, attributes } = props;
    const engine = this.engine;

    const settingCanvas = engine?.config.canvas ?? canvas;
    const settingAttribute = engine?.config.attributes ?? attributes;
    const Renderer = SceneRenderer ?? BasicSceneRenderer;

    settingCanvas && this.attachToScene(settingCanvas, settingAttribute);
    // this._rhi = engine.requireRHI(RHI, engine.config.canvas ?? canvas, attributes);
    this._sceneRenderer = new Renderer(this);

    if (this.node.scene) {
      this.node.scene.attachRenderCamera(this as any);
    }

    this.nearClipPlane = 0.1;
    this.farClipPlane = 100.0;
    this.fieldOfView = 45;

    this.viewportNormalized = [0, 0, 1, 1];
  }
  /**
   * 视图矩阵
   */
  public get viewMatrix(): ReadonlyArray<number> {
    // todo 监听 node 的 transform 变换
    return mat4.invert(this._viewMatrix, this.node.getModelMatrix());
  }

  /**
   * 近裁剪平面
   */
  public set nearClipPlane(value: number) {
    this._near = value;
    this.isProjectionDirty = true;
  }

  /**
   * 近裁剪平面
   */
  public get nearClipPlane(): number {
    return this._near;
  }

  /**
   * 远裁剪平面
   */
  public get farClipPlane(): number {
    return this._far;
  }

  /**
   * 近裁剪平面
   */
  public set farClipPlane(value: number) {
    this._far = value;
    this.isProjectionDirty = true;
  }

  /**
   * 视角，透视投影时生效
   */
  public get fieldOfView(): number {
    this.isProjectionDirty = true;
    return this._fov;
  }

  /**
   * 近裁剪平面
   */
  public set fieldOfView(value: number) {
    this._fov = value;
    this.isProjectionDirty = true;
  }

  /**
   * 正交模式下相机的一半尺寸
   */
  public get orthographicSize(): number {
    return this._orthographicSize;
  }

  /**
   * 设置正交模式下相机的一半尺寸
   */
  public set orthographicSize(value: number) {
    this._orthographicSize = value;
    this.isProjectionDirty = true;
  }

  /**
   * 世界坐标转换成屏幕坐标
   * @param worldPoint
   */
  public worldToScreenPoint(worldPoint: Vector3, out: Vector3): Vector3 {
    this.worldToViewportPoint(worldPoint, out);
    this.viewportToScreenPoint(out, out);
    return [0, 0, 0];
  }

  /**
   * 世界坐标转化成 viewport 坐标
   * @param worldPoint 世界坐标
   */
  public worldToViewportPoint(worldPoint: Vector3, out: Vector3): Vector3 {
    const matViewProj = mat4.create();
    mat4.mul(matViewProj, this.projectionMatrix, this.viewMatrix);

    const worldPos = vec4.fromValues(worldPoint[0], worldPoint[1], worldPoint[2], 1.0);
    const clipPos = vec4.create();
    vec4.transformMat4(clipPos, worldPos, matViewProj);

    const nx = clipPos[0] / clipPos[3];
    const ny = clipPos[1] / clipPos[3];
    const depth = clipPos[2] / clipPos[3];

    // 坐标轴转换
    const x = (nx + 1.0) * 0.5;
    const y = (1.0 - ny) * 0.5;

    out[0] = x;
    out[1] = y;
    out[2] = depth;
    return out;
  }

  /**
   * 屏幕点转成射线
   * @param position
   */
  public screenPointToRay(position: Vector2): Ray {
    return { origin: [0, 0, 0], direction: [0, 0, 0] };
  }

  /**
   * 屏幕坐标转化成视图坐标
   * @param position
   */
  public screenToViewportPoint<T extends Vector2 | Vector3>(position: Vector3 | Vector2, out: T): T {
    const nx = position[0];
    const ny = position[1];
    const viewport = this.viewportNormalized;
    const viewWidth = viewport[2];
    const viewHeight = viewport[3];
    out[0] = (nx - viewport[0]) / viewWidth;
    out[1] = (ny - viewport[1]) / viewHeight;
    return out;
  }

  /**
   * 屏幕坐标转化成世界坐标
   * @param position
   */
  public screenToWorldPoint(position: Vector3): Vector3 {
    let depth = position[2];
    if (depth === undefined) {
      depth = 0.0;
    }

    const screenPoint = [position[0], position[1]];

    // const canvas = this._rhi.canvas;
    const clientWidth = 375;
    const clientHeight = 600;
    const canvasWidth = 375;
    const canvasHeight = 600;

    const px = (screenPoint[0] / clientWidth) * canvasWidth;
    const py = (screenPoint[1] / clientHeight) * canvasHeight;

    const viewport = this.viewportNormalized;
    const viewWidth = viewport[2];
    const viewHeight = viewport[3];

    const nx = ((px - viewport[0]) / viewWidth) * 2 - 1;
    const ny = 1 - ((py - viewport[1]) / viewHeight) * 2;

    const p = vec4.fromValues(nx, ny, depth, 1.0);

    // const matViewProj = this.viewMatrix;
    const matViewProj = mat4.create();
    mat4.mul(matViewProj, this.projectionMatrix, this.viewMatrix);

    const matInv = mat4.create();
    mat4.invert(matInv, matViewProj);

    const u = vec4.create();
    vec4.transformMat4(u, p, matInv);

    return vec3.fromValues(u[0] / u[3], u[1] / u[3], u[2] / u[3]) as Vector3;
  }

  /**
   * 相机视口坐标转化成射线
   * @param position
   */
  public viewportPointToRay(position: Vector2): Ray {
    return { origin: [0, 0, 0], direction: [0, 0, 0] };
  }

  /**
   * 相机视口坐标转化成射线转化成世界坐标
   * @param position
   */
  public viewportToWorldPoint(position: Vector3, out: Vector3): Vector3 {
    return out;
  }

  /**
   * 相机视口坐标转化成屏幕点
   * @param position
   */
  public viewportToScreenPoint<T extends Vector2 | Vector3>(position: T, out: T): T {
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
   * 手动设置投影矩阵
   */
  public set projectionMatrix(p: Matrix4) {
    this._projectionMatrix = p;
    this.isProjectionMatrixSetting = true;
    this.shouldInvProjMatUpdate = true;
  }

  /**
   * 重置投影矩阵设置，让 fov，
   */
  public resetProjectionMatrix() {
    this.isProjectionMatrixSetting = false;
    this.isProjectionDirty = true;
  }

  /**
   * 获取投影矩阵
   */
  public get projectionMatrix(): Matrix4 {
    if (!this.isProjectionDirty || this.isProjectionMatrixSetting) {
      return this._projectionMatrix;
    }
    this.isProjectionDirty = false;
    this.shouldInvProjMatUpdate = true;
    if (!this.isOrthographic) {
      mat4.perspective(
        this._projectionMatrix,
        this.fieldOfView,
        this.viewportNormalized[2] / this.viewportNormalized[3],
        this.nearClipPlane,
        this.farClipPlane
      );
    } else {
      const width = (this._orthographicSize * this.viewportNormalized[2]) / this.viewportNormalized[3];
      const height = this._orthographicSize;
      mat4.ortho(this._projectionMatrix, -width, width, -height, height, this._near, this._far);
    }
    return this._projectionMatrix;
  }

  /**
   * @deprecated
   * @todo 涉及渲染管线修改 rhi.clearRenderTarget 方法
   * @param clearMode
   * @param clearParam
   */
  public setClearMode(clearMode: ClearMode, clearParam: number[]) {
    this._sceneRenderer.defaultRenderPass.clearParam = clearParam;
    this._sceneRenderer.defaultRenderPass.clearMode = clearMode;
  }

  /**
   * 渲染管线 todo 兼容
   * @deprecated
   */
  public get sceneRenderer(): BasicSceneRenderer {
    return this._sceneRenderer;
  }

  /**
   * todo 兼容旧版本，视图矩阵逆矩阵
   * @deprecated
   */
  public get inverseViewMatrix(): Mat4 {
    return this.node.getModelMatrix();
  }

  /**
   * 兼容旧的非归一化的 viewport
   * @todo 修改为归一化的 viewport
   * @deprecated
   */
  public get viewport(): Vector4 {
    return this._viewport;
  }

  /**
   * 获取相机视口
   * @todo 修改为 viewport
   */
  public get viewportNormalized(): Vector4 {
    return this._viewportNormalized;
  }

  /**
   * 设置相机视口，归一化的 viewport [0 - 1]
   * @todo 修改为 viewport
   */
  public set viewportNormalized(v: Vector4) {
    this._viewportNormalized = v;
    if (this.renderHardware) {
      const width = this.renderHardware.canvas.width;
      const height = this.renderHardware.canvas.height;
      this._viewport[0] = width * v[0];
      this._viewport[1] = height * v[1];
      this._viewport[2] = width * v[2];
      this._viewport[3] = height * v[3];
      this.renderHardware.viewport(this._viewport[0], this._viewport[1], this._viewport[2], this._viewport[3]);
    }
  }

  /**
   * 兼容旧的 renderHardware
   * @deprecated
   */
  public get renderHardware(): GLRenderHardware {
    return this._rhi;
    // return this.engine.requireRHI(this.rhi.);
  }

  /**
   * @todo
   */
  public set skyRenderer(skyRenderer: Sky) {}

  /**
   * @todo 渲染管线修改
   */
  public set clearBackgroundColor(value: Sky) {}

  /**
   * 渲染场景
   * @todo 渲染管线修改
   * @deprecated
   */
  public render() {
    this._sceneRenderer.render();
  }

  /**
   * @deprecated
   * @todo 数学库修改
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
   * 摄像机的位置(World Space)
   * @member {mat4}
   * @deprecated
   * @readonly
   */
  get eyePos() {
    return this.node.worldPosition;
  }

  /**
   * 兼容旧的 aspect
   * @deprecated
   */
  get aspect() {
    return this.aspectRatio;
  }

  /**
   * 获取 aspect ratio
   */
  get aspectRatio() {
    return this._aspectSetting ?? this.viewportNormalized[2] / this.viewportNormalized[3];
  }

  /**
   * 手动设置 aspect ratio
   */
  set aspectRatio(value: number) {
    this._aspectSetting = value;
  }

  /**
   * 重置手动设置的 aspect ratio
   */
  resetAspectRatio() {
    this._aspectSetting = undefined;
  }

  /**
   *
   */
  public attachToScene(canvas: HTMLCanvasElement, attributes?) {
    this._ownerNode.scene.attachRenderCamera(this as any);
    const engine = this._ownerNode.scene.engine;
    this._rhi = engine.requireRHI((this._props as any).RHI, canvas, {
      ...(this._props as any).attributes,
      ...attributes
    });
    // 触发 rhi viewport 设置
    this.viewportNormalized = this.viewportNormalized;
  }

  /**
   * 释放内部资源
   */
  public destroy(): void {
    super.destroy();

    // -- remove from scene
    this._ownerNode.scene.detachRenderCamera(this as any);

    // --
    if (this._sceneRenderer) {
      this._sceneRenderer.destroy();
    }
  }
}
