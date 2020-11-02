import { Matrix, Quaternion, Vector3, Vector4 } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { RenderableComponent } from "../RenderableComponent";
import { Texture2D } from "../texture/Texture2D";

interface IUvRect {
  u: number;
  v: number;
  width: number;
  height: number;
}

interface IRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface IPositionQuad {
  leftTop: Vector3;
  leftBottom: Vector3;
  rightTop: Vector3;
  rightBottom: Vector3;
}

/**
 * Sprite渲染管理器
 * @class
 */
export class SpriteRenderer extends RenderableComponent {
  private static _tempVec40: Vector4 = new Vector4();
  private static _tempVec41: Vector4 = new Vector4();
  private static _tempVec42: Vector4 = new Vector4();
  private static _tempVec43: Vector4 = new Vector4();

  private _uvRect: IUvRect;
  private _worldSize: number[] = [];
  private _positionQuad: IPositionQuad;
  private _rotationAngle: number = 0;
  private _anchor: number[];
  protected _texture: Texture2D;
  protected _rect: IRect;
  private _worldSizeFactor: number;

  /**
   * 渲染方式，2D或3D，默认是2D。TODO: 3D
   */
  renderMode: string = "2D";
  /**
   * 调节色，控制 Sprite 颜色变化
   */
  public tintColor: Vector4 = new Vector4(1, 1, 1, 1);
  public transformMatrix: Matrix;

  /**
   * 构造函数
   * @param {Entity} entity
   */
  constructor(entity: Entity) {
    super(entity);
    this._worldSizeFactor = 100;

    this.setTexture(undefined);
    this.setRect(undefined);
    this.setAnchor(undefined);
    this.setUvRect();
    this.setWorldSize();

    this._positionQuad = {
      leftTop: new Vector3(),
      leftBottom: new Vector3(),
      rightTop: new Vector3(),
      rightBottom: new Vector3()
    };
  }

  set texture(v) {
    this.setTexture(v);
    this.setRect();
    this.setUvRect();
    this.setWorldSize();
  }

  get texture() {
    return this._texture;
  }

  set anchor(v) {
    this._anchor = v || [0.5, 0.5];
  }

  get anchor() {
    return this._anchor;
  }

  set rect(v) {
    this.setRect(v);
    this.setUvRect();
    this.setWorldSize();
  }

  get rect() {
    return this._rect;
  }

  protected setTexture(texture) {
    // TODO：临时兼容Resource
    if (texture && texture.asset) {
      texture = texture.asset;
    }

    this._texture = texture;
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

  protected setRect(rect?) {
    let rectObject;
    try {
      if (rect) {
        rectObject = JSON.parse(rect);
      }
    } catch (error) {
      Logger.warn("Rect is not valid JSON format");
    }

    this._rect = rect || {
      x: 0,
      y: 0,
      width: this._texture?.width ?? 0,
      height: this._texture?.height ?? 0
    };
  }

  protected setAnchor(anchor) {
    this._anchor = anchor || [0.5, 0.5];
  }

  protected setWorldSize() {
    const { _worldSizeFactor } = this;
    this._worldSize = [this._rect.width / _worldSizeFactor, this._rect.height / _worldSizeFactor];
  }

  protected setUvRect() {
    let w, h;

    if (this._texture) {
      w = this._texture.width;
      h = this._texture.height;
    } else {
      w = this._rect.width;
      h = this._rect.height;
    }
    this._uvRect = {
      u: this._rect.x / w,
      v: this._rect.y / h,
      width: this._rect.width / w,
      height: this._rect.height / h
    };
  }

  /**
   * 更新位置，将数据对象加入渲染队列
   * @param {Camera} camera
   */
  render(camera: Camera) {
    this._updatePositionQuad(camera);
    this._transformByMatrix();
    camera._renderPipeline.pushSprite(
      this,
      this._positionQuad,
      this._uvRect,
      this.tintColor,
      this.texture,
      this.renderMode,
      camera
    );
  }

  _transformByMatrix() {
    if (!this.transformMatrix) return;
    const matrix = this.transformMatrix;

    let temp: Vector3 = this._positionQuad.leftTop;
    const leftTop: Vector4 = SpriteRenderer._tempVec40;
    leftTop.setValue(temp.x, temp.y, temp.z, 1);

    temp = this._positionQuad.leftBottom;
    const leftBottom: Vector4 = SpriteRenderer._tempVec41;
    leftBottom.setValue(temp.x, temp.y, temp.z, 1);

    temp = this._positionQuad.rightTop;
    const rightTop: Vector4 = SpriteRenderer._tempVec42;
    rightTop.setValue(temp.x, temp.y, temp.z, 1);

    temp = this._positionQuad.rightBottom;
    const rightBottom: Vector4 = SpriteRenderer._tempVec43;
    rightBottom.setValue(temp.x, temp.y, temp.z, 1);

    Vector4.transform(leftTop, matrix, leftTop);
    Vector4.transform(leftBottom, matrix, leftBottom);
    Vector4.transform(rightTop, matrix, rightTop);
    Vector4.transform(rightBottom, matrix, rightBottom);

    this._positionQuad.leftTop.setValue(leftTop.x, leftTop.y, leftTop.z);
    this._positionQuad.leftBottom.setValue(leftBottom.x, leftBottom.y, leftBottom.z);
    this._positionQuad.rightTop.setValue(rightTop.x, rightTop.y, rightTop.z);
    this._positionQuad.rightBottom.setValue(rightBottom.x, rightBottom.y, rightBottom.z);
  }

  /**
   * 更新顶点位置
   * @param {Camera} camera
   * @private
   */
  _updatePositionQuad(camera: Camera) {
    if (this.renderMode === "2D") {
      const m = camera.viewMatrix.elements;
      const vx = new Vector3(m[0], m[4], m[8]);
      const vy = new Vector3(m[1], m[5], m[9]);
      //-- center pos
      const c: Vector3 = this.entity.worldPosition.clone();
      const s = this._worldSize;
      const ns = this.entity.scale;

      vx.scale(s[0] * ns.x);
      vy.scale(s[1] * ns.y);

      if (this._rotationAngle !== 0) {
        const vz = new Vector3(m[2], m[6], m[10]);

        const rotation: Quaternion = new Quaternion();
        Quaternion.rotationAxisAngle(vz, this._rotationAngle, rotation);

        Vector3.transformByQuat(vx, rotation, vx);
        Vector3.transformByQuat(vy, rotation, vy);
      }

      const cx: Vector3 = new Vector3();
      const cy: Vector3 = new Vector3();
      Vector3.scale(vx, (this.anchor[0] - 0.5) * 2, cx);
      Vector3.scale(vy, (this.anchor[1] - 0.5) * 2, cy);

      c.subtract(cx).add(cy);

      //-- quad pos
      const leftTop: Vector3 = this._positionQuad.leftTop;
      Vector3.subtract(c, vx, leftTop);
      leftTop.add(vy);

      const leftBottom: Vector3 = this._positionQuad.leftBottom;
      Vector3.subtract(c, vx, leftBottom);
      leftBottom.subtract(vy);

      const rightBottom: Vector3 = this._positionQuad.rightBottom;
      Vector3.add(c, vx, rightBottom);
      rightBottom.subtract(vy);

      const rightTop: Vector3 = this._positionQuad.rightTop;
      Vector3.add(c, vx, rightTop);
      rightTop.add(vy);
    } else {
      // TODO: 3D
    }
  }
}
