import { vec2, vec3, vec4, quat } from "@alipay/o3-math";
import { HUDFeature } from "./HUDFeature";
import { RenderableComponent } from "@alipay/o3-core";

var widgetID = 1000;

/**
 * HUD控件的基类，封装2D和3D控件的通用属性和操作
 */
export class AHUDWidget extends RenderableComponent {
  protected _spriteRect;
  protected _canvasDirty;

  private _spriteID;
  private _renderMode;
  private _screenSize;
  private _worldSize;
  private _anchor;
  private _rotationAngle;
  private _scale;
  private _positionQuad;
  private _uvRect;
  private _tintColor;
  private _valid;
  private _hudFeature;
  private separateDraw;

  /**
   * @constructor
   * @param {Node} node
   * @param {Object} props 参数对象
   * @param {string} props.spriteID 控件内部使用的Sprite ID，如果Sprite ID相同的话，则会共享Canvas中的同一区域
   * @param {vec2} props.textureSize 在内置Canvas上的纹理大小
   * @param {string} props.renderMode 渲染方式，2D或3D，默认是2D
   * @param {vec2} props.screenSize 屏幕上的像素大小，2D模式下生效
   * @param {vec2} props.worldSize  世界空间下大小，3D模式下生效
   */
  constructor(node, props) {
    super(node);

    this._spriteRect = { x: 0, y: 0, width: 10, height: 10 }; // 控件在Canvas上的像素坐标, 像素大小
    this._spriteRect.width = props.textureSize[0];
    this._spriteRect.height = props.textureSize[1];

    this._spriteID = props.spriteID ? props.spriteID : "widget_" + widgetID++;

    // 设置渲染方式
    this._renderMode = props.renderMode || "2D";
    this._screenSize = props.screenSize || props.textureSize;
    this._worldSize = props.worldSize || [1, 1];

    this._anchor = [0.5, 0.5];
    this._rotationAngle = props.rotationAngle || 0;
    this._scale = props.scale || [1.0, 1.0];

    this._positionQuad = {
      leftTop: vec3.create(),
      leftBottom: vec3.create(),
      rightTop: vec3.create(),
      rightBottom: vec3.create()
    };
    this._uvRect = { u: 0, v: 0, width: 1, height: 1 };
    this._tintColor = vec4.fromValues(1, 1, 1, 1);

    this._canvasDirty = true;
    this._valid = false; // sprite 分配失败等情况下，可能为false，则控件无法绘制出来
    this._hudFeature = this.scene.findFeature(HUDFeature);

    /**
     * 当设置为true时，HUD widget渲染不受后处理影响
     * @member {boolean}
     */
    this.separateDraw = false;
  }

  /** 在对象Enable的时候，挂载到当前的Scene
   * @private
   */
  _onEnable() {
    this._hudFeature.attachWidget(this.node.engine.hardwareRenderer, this);
  }

  /** 在对象Disable的时候，从当前的Scene移除
   * @private
   */
  _onDisable() {
    this._hudFeature.detachWidget(this);
  }

  /**
   * 资源释放
   */
  destroy() {
    super.destroy(); //-- remove from scene

    this._hudFeature.releaseWidget(this);
  }

  /**
   * 锚点信息
   * @member {vec2}
   */
  get anchor() {
    return this._anchor;
  }
  set anchor(val) {
    this._anchor = vec2.fromValues(val[0], val[1]);
  }

  /**
   * 控件在Canvas中的像素位置和大小
   * @member {Object}
   * @readonly
   */
  get spriteRect() {
    return this._spriteRect;
  }

  /**
   * 控件的spriteID
   * @member {string}
   * @readonly
   */
  get spriteID() {
    return this._spriteID;
  }

  /**
   * 变色
   * @member {vec4}
   */
  get tintColor() {
    return this._tintColor;
  }
  set tintColor(val) {
    this._tintColor = vec4.fromValues(val[0], val[1], val[2], val[3]);
  }

  /**
   * 旋转角度
   * @member {vec4}
   */
  get rotationAngle() {
    return this._rotationAngle;
  }

  set rotationAngle(v) {
    this._rotationAngle = v;
  }

  /**
   * 缩放值
   * @member {vec2}
   */
  get scale() {
    return this._scale;
  }

  set scale(v) {
    this._scale = v;
  }

  /**
   * 更新在Canvas上面分配的区域信息
   * @param {object} spriteData
   */
  setSpriteInfo(spriteData) {
    this._valid = spriteData.valid;
    this._uvRect = spriteData.uvRect;
    this._spriteRect = spriteData.spriteRect;
  }

  /**
   * Component的Render接口实现
   * @param {String} 控件的渲染模式：2D或3D
   * @param {vec2}   控件在该渲染模式下的尺寸，2D模式下代表screen size, 3D模式下代表world size
   */
  setRenderMode(renderMode, size) {
    if (renderMode === "2D" || renderMode === "3D") {
      this._renderMode = renderMode;
      if (renderMode === "2D") {
        this._screenSize = size;
      } else {
        this._worldSize = size;
      }
    }
  }

  /**
   * 真正执行GL绘制的地方
   * @param {Camera} camera
   */
  render(camera) {
    if (!this._valid) {
      return;
    }

    this._updatePositionQuad(camera);

    // update canvas
    if (this._canvasDirty) {
      this.drawWidget(this._hudFeature.context2D);
      this._canvasDirty = false;
      this._hudFeature.addDirtyRect(this._spriteRect);
    }

    camera.sceneRenderer.pushSprite(
      this,
      this._positionQuad,
      this._uvRect,
      this._tintColor,
      this._hudFeature.texture,
      this._renderMode,
      camera
    );
  }

  /**
   * 将控件的内容绘制到贴图Canvas之上
   * @param {CanvasRenderingContext2D} ctx2d
   */
  drawWidget(ctx2d) {
    if (this._valid) {
      const x = this._spriteRect.x;
      const y = this._spriteRect.y;
      const w = this._spriteRect.width;
      const h = this._spriteRect.height;
      ctx2d.clearRect(x, y, w, h);
    }
  }

  /**
   * 更新HUD控件四个顶点的位置
   * @param {ACamera} camera
   * @private
   */
  _updatePositionQuad(camera) {
    const m = camera.viewMatrix;
    const vx = vec3.fromValues(m[0], m[4], m[8]);
    const vy = vec3.fromValues(m[1], m[5], m[9]);

    //-- center pos
    const c = this.node.worldPosition;
    const s = this._getHalfWorldSize(camera);
    vec3.scale(vx, vx, s[0] * this._scale[0]);
    vec3.scale(vy, vy, s[1] * this._scale[1]);

    if (this._rotationAngle !== 0) {
      const vz = vec3.fromValues(m[2], m[6], m[10]);
      const rotation = quat.create();
      quat.setAxisAngle(rotation, vz, this._rotationAngle);

      vec3.transformQuat(vx, vx, rotation);
      vec3.transformQuat(vy, vy, rotation);
    }

    const cx = vec3.create();
    const cy = vec3.create();
    vec3.scale(cx, vx, (this._anchor[0] - 0.5) * 2);
    vec3.scale(cy, vy, (this._anchor[1] - 0.5) * 2);

    vec3.sub(c, c, cx);
    vec3.add(c, c, cy);

    //-- quad pos
    const leftTop = vec3.create();
    vec3.sub(leftTop, c, vx);
    vec3.add(leftTop, leftTop, vy);

    const leftBottom = vec3.create();
    vec3.sub(leftBottom, c, vx);
    vec3.sub(leftBottom, leftBottom, vy);

    const rightBottom = vec3.create();
    vec3.add(rightBottom, c, vx);
    vec3.sub(rightBottom, rightBottom, vy);

    const rightTop = vec3.create();
    vec3.add(rightTop, c, vx);
    vec3.add(rightTop, rightTop, vy);

    // update quad position
    this._positionQuad.leftTop = leftTop;
    this._positionQuad.leftBottom = leftBottom;
    this._positionQuad.rightTop = rightTop;
    this._positionQuad.rightBottom = rightBottom;
  }

  /**
   * 取得HUD控件在世界空间中的大小
   * @param {ACamera} camera
   * @private
   */
  _getHalfWorldSize(camera) {
    let halfWorldSize = null;
    if (this._renderMode === "2D") {
      const canvas = camera.renderHardware.canvas;
      const clientWidth = canvas.clientWidth;
      const clientHeight = canvas.clientHeight;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const size = this._screenSize;
      const px = (size[0] / clientWidth) * canvasWidth;
      const py = (size[1] / clientHeight) * canvasHeight;

      const viewport = camera.viewport;
      const nx = px / viewport[2];
      const ny = py / viewport[3];

      const screenPos = camera.worldToScreen(this.node.worldPosition);
      const depth = screenPos[2];
      const u = vec4.fromValues(nx, ny, depth, 1.0);

      const w = vec4.create();
      vec4.transformMat4(w, u, camera.inverseProjectionMatrix);

      halfWorldSize = [Math.abs(w[0] / w[3]), Math.abs(w[1] / w[3])];
    } else {
      halfWorldSize = vec2.create();
      vec2.scale(halfWorldSize, this._worldSize, 0.5);
    }

    return halfWorldSize;
  }
}
