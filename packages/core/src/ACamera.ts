import { ClearMode } from "@alipay/o3-base";
import { NodeAbility } from "./NodeAbility";
import { mat4, vec4, vec3, vec2, MathUtil } from "@alipay/o3-math";
import { Node } from "./Node";
import { ICameraProps, RHIOption } from "./type";

const vec3Cache = vec3.create();

/**
 * 3D 摄像机组件，添加到一个 Node 上，以 Node 的空间作为 Camera Space
 * @extends NodeAbility
 */
export class ACamera extends NodeAbility {
  get aspect() {
    return this.viewport[2] / this.viewport[3];
  }

  get renderHardware() {
    return this._rhi;
  }

  get sceneRenderer() {
    return this._sceneRenderer;
  }

  /**
   * 摄像机的位置(World Space)
   * @member {mat4}
   * @readonly
   */
  get eyePos() {
    return this._ownerNode.worldPosition;
  }

  /**
   * View 矩阵
   * @member {mat4}
   * @readonly
   */
  public viewMatrix;

  /**
   * View 矩阵的逆矩阵
   * @member {mat4}
   * @readonly
   */
  public inverseViewMatrix;

  /**
   * 投影矩阵
   * @member {mat4}
   * @readonly
   */
  public projectionMatrix;

  /**
   * 投影矩阵的逆矩阵
   * @member {mat4}
   * @readonly
   */
  public inverseProjectionMatrix;

  public zNear: number;

  public zFar: number;

  public colorWriteMask: boolean[];

  public viewport;

  public leftHand;

  public _rhi;

  private _sceneRenderer;

  private _isOrtho: boolean;

  /**
   * 构造函数
   * @param {Node} node 对象所在节点
   * @param {Object} props  相机配置参数，包含以下项
   * @property {Canvas|String} props.canvas 画布对象，可以是 HTML Canvas Element 或者对象的 id
   * @property {RHIOption} [props.attributes] - RHI 操作参数
   * @property {SceneRenderer} [props.SceneRenderer] 渲染器类型，{@link BasicSceneRenderer} 和 {@link SceneRenderer}
   * @property {GLRenderHardware} [props.RHI] 硬件抽象层类型，{@link GLRenderHardware}
   */
  constructor(node: Node, props: ICameraProps) {
    super(node, props);

    const { RHI, SceneRenderer, canvas, attributes } = props;
    const engine = this._ownerNode.scene.engine;

    this._rhi = engine.requireRHI(RHI, canvas, attributes);
    this._sceneRenderer = new SceneRenderer(this);
    this._isOrtho = false; // 逸瞻：标记是不是ortho，用于射线检测时区分处理
    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.inverseViewMatrix = mat4.create();
    this.inverseProjectionMatrix = mat4.create();

    this.node.scene.attachRenderCamera(this);

    this.zNear = 1.0;
    this.zFar = 100.0;

    /**
     * 颜色通道写入控制
     */
    this.colorWriteMask = [true, true, true, true];

    /**
     * View port: [x, y, width, height]
     */
    this.viewport = [0, 0, this._rhi.canvas.width, this._rhi.canvas.height];

    /**
     * 是否为左手系相机，默认为 false
     * @member {Boolean}
     */
    this.leftHand = false;
  }

  /**
   * 渲染场景
   */
  public render() {
    this._sceneRenderer.render();
  }

  /**
   * 设置 Render Target 的清空模式
   * @param {ClearMode} mode
   * @param {*} clearParam 其类型根据 Mode 而不同
   */
  public setClearMode(mode: ClearMode, clearParam: number[]) {
    const defaultRP = this._sceneRenderer.defaultRenderPass;
    defaultRP.clearMode = mode;
    defaultRP.clearParam = clearParam;
  }

  /**
   * 设置透视矩阵
   * @param {number} degFOV 视角（field of view），使用角度
   * @param {number} aspect View Port 的宽高比
   * @param {number} zNear 视锥的近剪裁面
   * @param {number} zFar 视锥的远剪裁面
   */
  public setPerspective(degFOV: number, viewWidth: number, viewHeight: number, zNear: number, zFar: number): void {
    this._isOrtho = false; // 逸瞻：标记变更

    this.zNear = zNear;
    this.zFar = zFar;

    const aspect = viewWidth / viewHeight;
    mat4.perspective(this.projectionMatrix, MathUtil.toRadian(degFOV), aspect, zNear, zFar);
    mat4.invert(this.inverseProjectionMatrix, this.projectionMatrix);
  }

  /**
   * 设置视口区域
   * @param {number} x 视口的左下角水平坐标
   * @param {number} y 视口的左下角垂直坐标
   * @param {number} width 视口的宽度
   * @param {number} height 视口的高度
   */
  public setViewport(x: number, y: number, width: number, height: number): void {
    this.viewport = [x, y, width, height];
    this._rhi.viewport(x, y, width, height);
  }

  /**
   * 设置平行投影矩阵
   * @param {number} left 视锥的左侧范围
   * @param {number} right 视锥的右侧范围
   * @param {number} bottom 视锥的下方范围
   * @param {number} top 视锥的上方范围
   * @param {number} near 视锥的近端范围
   * @param {number} far 视锥的远端范围
   */
  public setOrtho(left: number, right: number, bottom: number, top: number, near: number, far: number): void {
    this._isOrtho = true; // 逸瞻：标记变更

    this.zNear = near;
    this.zFar = far;

    mat4.ortho(this.projectionMatrix, left, right, bottom, top, near, far);
    mat4.invert(this.inverseProjectionMatrix, this.projectionMatrix); // 逸瞻：逻辑补全，否则无法正确渲染场景
  }

  /**
   * 把一个 3D 世界坐标，转换到屏幕坐标
   * @param {vec3} worldPoint 世界空间的坐标点
   * @return {vec3} [屏幕坐标X, 屏幕坐标Y, 深度值]
   */
  public worldToScreen(worldPoint) {
    const viewport = this.viewport;
    const width = viewport[2] - viewport[0];
    const height = viewport[3] - viewport[1];

    const matViewProj = mat4.create();
    mat4.mul(matViewProj, this.projectionMatrix, this.viewMatrix);

    const worldPos = vec4.fromValues(worldPoint[0], worldPoint[1], worldPoint[2], 1.0);
    const clipPos = vec4.create();
    vec4.transformMat4(clipPos, worldPos, matViewProj);

    const nx = clipPos[0] / clipPos[3];
    const ny = clipPos[1] / clipPos[3];
    const depth = clipPos[2] / clipPos[3];

    let x = (nx + 1.0) * 0.5 * width;
    let y = (1.0 - ny) * 0.5 * height;

    const canvas = this._rhi.canvas;
    const clientWidth = canvas.clientWidth;
    const clientHeight = canvas.clientHeight;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    x = (x * clientWidth) / canvasWidth;
    y = (y * clientHeight) / canvasHeight;

    return vec3.fromValues(x, y, depth);
  }

  /**
   * 将一个屏幕坐标，转换到3D世界空间
   * @param {vec2} screenPoint 屏幕像素坐标
   * @param {Number} depth 深度
   * @return {vec3} 世界坐标
   */
  public screenToWorld(screenPoint, depth) {
    if (depth === undefined) {
      depth = 0.0;
    }

    const canvas = this._rhi.canvas;
    const clientWidth = canvas.clientWidth;
    const clientHeight = canvas.clientHeight;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const px = (screenPoint[0] / clientWidth) * canvasWidth;
    const py = (screenPoint[1] / clientHeight) * canvasHeight;

    const viewport = this.viewport;
    const viewWidth = viewport[2];
    const viewHeight = viewport[3];

    const nx = ((px - viewport[0]) / viewWidth) * 2 - 1;
    const ny = 1 - ((py - viewport[1]) / viewHeight) * 2;

    const p = vec4.fromValues(nx, ny, depth, 1.0);

    const matViewProj = mat4.create();
    mat4.mul(matViewProj, this.projectionMatrix, this.viewMatrix);

    const matInv = mat4.create();
    mat4.invert(matInv, matViewProj);

    const u = vec4.create();
    vec4.transformMat4(u, p, matInv);

    return vec3.fromValues(u[0] / u[3], u[1] / u[3], u[2] / u[3]);
  }

  /**
   * 计算屏幕坐标对应的射线
   * @param {number} screenPointX 屏幕X坐标
   * @param {number} screenPointY 屏幕Y坐标
   */
  public screenPointToRay(screenPointX: number, screenPointY: number): { origin; direction } {
    // 逸瞻：区分camera类型设置origin
    let origin;
    if (this._isOrtho) {
      origin = this.worldToScreen([screenPointX, screenPointY]);
    } else {
      origin = this.eyePos;
    }
    const tmp = this.screenToWorld([screenPointX, screenPointY], 0.5); // world position on depth=0.5
    vec3.sub(tmp, tmp, origin); // ray direction
    vec3.normalize(tmp, tmp);
    return {
      origin,
      direction: tmp
    };
  }

  /**
   * 释放内部资源
   */
  public destroy(): void {
    super.destroy();

    // -- remove from scene
    this._ownerNode.scene.detachRenderCamera(this);

    // --
    if (this._sceneRenderer) {
      this._sceneRenderer.destroy();
    }

    // -- destroy render hardware
    if (this._rhi) {
      this._rhi.destroy();
    }
  }

  // 每一帧更新相机所需的矩阵
  public update(deltaTime: number): void {
    super.update(deltaTime);

    // make sure update directions
    this.node.getModelMatrix();

    vec3.copy(vec3Cache, this._ownerNode.forward);
    if (this.leftHand) {
      vec3.scale(vec3Cache, vec3Cache, -1);
    }
    vec3.add(vec3Cache, this._ownerNode.position, vec3Cache);
    mat4.lookAt(this.viewMatrix, this._ownerNode.position, vec3Cache, this._ownerNode.up);
    mat4.invert(this.inverseViewMatrix, this.viewMatrix);
  }
}
