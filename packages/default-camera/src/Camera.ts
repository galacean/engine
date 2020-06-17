import { NodeAbility } from "@alipay/o3-core";
import { vec3, mat4, MathUtil, vec4 } from "@alipay/o3-math";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { BasicSceneRenderer } from "@alipay/o3-renderer-basic";
import { Node } from "@alipay/o3-core";

const vec3Cache = vec3.create();

/**
 * 3D 摄像机组件，添加到一个 Node 上，以 Node 的空间作为 Camera Space
 */
export class Camera extends NodeAbility {
  get renderHardware() {
    return this._rhi;
  }

  get sceneRenderer() {
    return this._sceneRenderer;
  }

  /**
   * View 矩阵
   * @member {Float32Array}
   * @readonly
   */
  get viewMatrix(): Float32Array | number[] {
    return this._viewMat;
  }

  /**
   * View 矩阵的逆矩阵
   * @member {Float32Array}
   * @readonly
   */
  get inverseViewMatrix(): Float32Array | number[] {
    return this._inverseViewMatrix;
  }

  /**
   * 投影矩阵
   * @member {Float32Array}
   * @readonly
   */
  get projectionMatrix(): Float32Array | number[] {
    return this._matProjection;
  }

  /**
   * 投影矩阵的逆矩阵
   * @member {Float32Array}
   * @readonly
   */
  get inverseProjectionMatrix(): Float32Array | number[] {
    return this._matInverseProjection;
  }

  /**
   * 摄像机的位置(World Space)
   * @member {Float32Array}
   * @readonly
   */
  get eyePos(): Float32Array {
    return this._ownerNode.worldPosition as any;
  }

  public zNear: number;

  public zFar: number;

  public colorWriteMask;

  public viewport;

  public leftHand;

  public _rhi: GLRenderHardware;

  private readonly _sceneRenderer: BasicSceneRenderer;

  private _isOrtho: boolean;

  private readonly _viewMat: Float32Array | any[];

  private readonly _matProjection: Float32Array | any[];

  private readonly _inverseViewMatrix: Float32Array | any[];

  private readonly _matInverseProjection: Float32Array | any[];

  constructor(node: Node, props) {
    super(node, props);

    const { SceneRenderer, canvas } = props;

    this._sceneRenderer = new SceneRenderer(this);
    this._isOrtho = false; // 逸瞻：标记是不是ortho，用于射线检测时区分处理
    this._viewMat = mat4.create();
    this._matProjection = mat4.create();
    this._inverseViewMatrix = mat4.create();
    this._matInverseProjection = mat4.create();

    this.zNear = 1.0;
    this.zFar = 100.0;

    /**
     * 颜色通道写入控制
     */
    this.colorWriteMask = [true, true, true, true];

    /**
     * 是否为左手系相机，默认为 false
     * @member {Boolean}
     */
    this.leftHand = false;

    canvas && this.attachToScene(canvas);
  }

  public attachToScene(canvas: HTMLCanvasElement, attributes?) {
    this._ownerNode.scene.attachRenderCamera(this as any);
    const engine = this._ownerNode.scene.engine;
    this._rhi = engine.requireRHI((this._props as any).RHI, canvas, {
      ...(this._props as any).attributes,
      ...attributes
    });
    /**
     * View port: [x, y, width, height]
     */
    this.viewport = [0, 0, this._rhi.canvas.width, this._rhi.canvas.height];
  }

  /**
   * 渲染场景
   */
  public render() {
    this._sceneRenderer.render();
  }

  /**
   * 设置 Render Target 的清空模式
   * @param mode
   * @param {*} clearParam 其类型根据 Mode 而不同
   */
  public setClearMode(mode, clearParam) {
    const defaultRP = this._sceneRenderer.defaultRenderPass;
    defaultRP.clearMode = mode;
    defaultRP.clearParam = clearParam;
  }

  /**
   * 设置透视矩阵
   * @param {number} degFOV 视角（field of view），使用角度
   * @param viewWidth
   * @param viewHeight
   * @param {number} zNear 视锥的近剪裁面
   * @param {number} zFar 视锥的远剪裁面
   */
  public setPerspective(degFOV, viewWidth, viewHeight, zNear, zFar) {
    this._isOrtho = false; // 逸瞻：标记变更

    this.zNear = zNear;
    this.zFar = zFar;

    const aspect = viewWidth / viewHeight;
    mat4.perspective(this._matProjection, MathUtil.toRadian(degFOV), aspect, zNear, zFar);
    mat4.invert(this._matInverseProjection, this._matProjection);
  }

  /**
   * 设置视口区域
   * @param {number} x 视口的左下角水平坐标
   * @param {number} y 视口的左下角垂直坐标
   * @param {number} width 视口的宽度
   * @param {number} height 视口的高度
   */
  public setViewport(x, y, width, height) {
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
  public setOrtho(left, right, bottom, top, near, far) {
    this._isOrtho = true; // 逸瞻：标记变更

    this.zNear = near;
    this.zFar = far;

    mat4.ortho(this._matProjection, left, right, bottom, top, near, far);
    mat4.invert(this._matInverseProjection, this._matProjection); // 逸瞻：逻辑补全，否则无法正确渲染场景
  }

  /**
   * 把一个 3D 世界坐标，转换到屏幕坐标
   * @param {Float32Array | Array<number>} worldPoint 世界空间的坐标点
   * @return {Float32Array} [屏幕坐标X, 屏幕坐标Y, 深度值]
   */
  public worldToScreen(worldPoint: Float32Array | number[]): Float32Array | any[] {
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
   * @param screenPoint 屏幕像素坐标
   * @param {Number} depth 深度
   * @return 世界坐标
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
    const viewWidth = viewport[2] - viewport[0];
    const viewHeight = viewport[3] - viewport[1];

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
  public screenPointToRay(screenPointX, screenPointY) {
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
  public destroy() {
    super.destroy();

    // -- remove from scene
    this._ownerNode.scene.detachRenderCamera(this as any);

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
  public update(deltaTime) {
    super.update(deltaTime);

    // make sure update directions
    this._ownerNode.getModelMatrix();

    vec3.copy(vec3Cache, this._ownerNode.forward);
    if (this.leftHand) {
      vec3.scale(vec3Cache, vec3Cache, -1);
    }
    vec3.add(vec3Cache, this._ownerNode.position, vec3Cache);
    mat4.lookAt(this._viewMat, this._ownerNode.position, vec3Cache, this._ownerNode.up);
    mat4.invert(this._inverseViewMatrix, this._viewMat);
  }
}
