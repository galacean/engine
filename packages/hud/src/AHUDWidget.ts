import { Vector2, Vector3, Vector4, Quaternion, Matrix } from "@alipay/o3-math";
import { HUDFeature } from "./HUDFeature";
import { RenderableComponent, Camera } from "@alipay/o3-core";

var widgetID = 1000;

/**
 * HUD控件的基类，封装2D和3D控件的通用属性和操作
 */
export class AHUDWidget extends RenderableComponent {
  protected _spriteRect;
  protected _canvasDirty;

  private _spriteID;
  private _renderMode;
  private _screenSize: Vector2;
  private _worldSize: Vector2;
  private _anchor: Vector2;
  private _rotationAngle;
  private _scale: Vector2;
  private _positionQuad;
  private _uvRect;
  private _tintColor: Vector4;
  private _valid;
  private _hudFeature;
  private separateDraw;

  /**
   * @constructor
   * @param {Entity} entity
   * @param {Object} props 参数对象
   * @param {string} props.spriteID 控件内部使用的Sprite ID，如果Sprite ID相同的话，则会共享Canvas中的同一区域
   * @param {Vector2} props.textureSize 在内置Canvas上的纹理大小
   * @param {string} props.renderMode 渲染方式，2D或3D，默认是2D
   * @param {Vector2} props.screenSize 屏幕上的像素大小，2D模式下生效
   * @param {Vector2} props.worldSize  世界空间下大小，3D模式下生效
   */
  constructor(entity, props) {
    super(entity);

    this._spriteRect = { x: 0, y: 0, width: 10, height: 10 }; // 控件在Canvas上的像素坐标, 像素大小
    this._spriteRect.width = props.textureSize.x;
    this._spriteRect.height = props.textureSize.y;

    this._spriteID = props.spriteID ? props.spriteID : "widget_" + widgetID++;

    // 设置渲染方式
    this._renderMode = props.renderMode || "2D";
    this._screenSize = props.screenSize || props.textureSize || new Vector2();
    this._worldSize = props.worldSize || new Vector2(1, 1);

    this._anchor = new Vector2(0.5, 0.5);
    this._rotationAngle = props.rotationAngle || 0;
    this._scale = props.scale || new Vector2(1.0, 1.0);

    this._positionQuad = {
      leftTop: new Vector3(),
      leftBottom: new Vector3(),
      rightTop: new Vector3(),
      rightBottom: new Vector3()
    };
    this._uvRect = { u: 0, v: 0, width: 1, height: 1 };
    this._tintColor = new Vector4(1, 1, 1, 1);

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
    this._hudFeature.attachWidget();
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
   * @member {Vector2}
   */
  get anchor(): Vector2 {
    return this._anchor;
  }
  set anchor(val: Vector2) {
    this._anchor.setValue(val.x, val.y);
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
   * @member {Vector4}
   */
  get tintColor(): Vector4 {
    return this._tintColor;
  }
  set tintColor(val: Vector4) {
    this._tintColor.setValue(val.x, val.y, val.z, val.w);
  }

  /**
   * 旋转角度
   * @member {Vector4}
   */
  get rotationAngle() {
    return this._rotationAngle;
  }

  set rotationAngle(v) {
    this._rotationAngle = v;
  }

  /**
   * 缩放值
   * @member {Vector2}
   */
  get scale(): Vector2 {
    return this._scale;
  }

  set scale(v: Vector2) {
    this._scale.setValue(v.x, v.y);
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
   * @param {Vector2}   控件在该渲染模式下的尺寸，2D模式下代表screen size, 3D模式下代表world size
   */
  setRenderMode(renderMode: string, size: Vector2) {
    if (renderMode === "2D" || renderMode === "3D") {
      this._renderMode = renderMode;
      if (renderMode === "2D") {
        this._screenSize.setValue(size.x, size.y);
      } else {
        this._worldSize.setValue(size.x, size.y);
      }
    }
  }

  /**
   * 真正执行GL绘制的地方
   * @param {Camera} camera
   */
  render(camera: Camera) {
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

    camera._renderPipeline.pushSprite(
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
   * @param {Camera} camera
   * @private
   */
  _updatePositionQuad(camera: Camera) {
    const m: Matrix = camera.viewMatrix;
    const me = m.elements;
    const vx = new Vector3(me[0], me[4], me[8]);
    const vy = new Vector3(me[1], me[5], me[9]);

    //-- center pos
    const c: Vector3 = this.entity.worldPosition;
    const s: Vector2 = this._getHalfWorldSize(camera);
    vx.scale(s.x * this._scale.x);
    vy.scale(s.y * this._scale.y);

    if (this._rotationAngle !== 0) {
      const vz = new Vector3(me[2], me[6], me[10]);
      const rotation = new Quaternion();
      rotation.setAxisAngle(vz, this._rotationAngle);

      Vector3.transformByQuat(vx, rotation, vx);
      Vector3.transformByQuat(vy, rotation, vy);
    }

    const cx = new Vector3();
    const cy = new Vector3();
    Vector3.scale(vx, (this._anchor.x - 0.5) * 2, cx);
    Vector3.scale(vy, (this._anchor.y - 0.5) * 2, cy);

    c.subtract(cx).add(cy);

    //-- quad pos
    const leftTop = new Vector3();
    Vector3.subtract(c, vx, leftTop);
    leftTop.add(vy);

    const leftBottom = new Vector3();
    Vector3.subtract(c, vx, leftBottom);
    leftBottom.subtract(vy);

    const rightBottom = new Vector3();
    Vector3.add(c, vx, rightBottom);
    rightBottom.subtract(vy);

    const rightTop = new Vector3();
    Vector3.add(c, vx, rightTop);
    rightTop.add(vy);

    // update quad position
    this._positionQuad.leftTop = leftTop;
    this._positionQuad.leftBottom = leftBottom;
    this._positionQuad.rightTop = rightTop;
    this._positionQuad.rightBottom = rightBottom;
  }

  /**
   * 取得HUD控件在世界空间中的大小
   * @param {Camera} camera
   * @private
   */
  _getHalfWorldSize(camera: Camera): Vector2 {
    let halfWorldSize = new Vector2();

    if (this._renderMode === "2D") {
      const canvas = (<any>this.engine.canvas)._webCanvas;
      const clientWidth = canvas.clientWidth;
      const clientHeight = canvas.clientHeight;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const size = this._screenSize;
      const px = (size.x / clientWidth) * canvasWidth;
      const py = (size.y / clientHeight) * canvasHeight;

      const viewport = camera.viewport;
      const nx = px / viewport.z;
      const ny = py / viewport.w;
      const screenPos = new Vector4();
      camera.worldToViewportPoint(this.entity.worldPosition, screenPos);
      camera.viewportToScreenPoint(screenPos, screenPos);
      const depth = screenPos.z;
      const u = new Vector4(nx, ny, depth, 1.0);

      const w = new Vector4();
      Vector3.transformByMat4x4(u, camera.inverseProjectionMatrix, w);

      halfWorldSize.setValue(Math.abs(w.x / w.w), Math.abs(w.y / w.w));
    } else {
      Vector2.scale(this._worldSize, 0.5, halfWorldSize);
    }

    return halfWorldSize;
  }
}
