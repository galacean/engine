import { RenderableComponent } from "@alipay/o3-core";
import { vec3, vec4, quat } from "@alipay/o3-math";
import { Texture2D } from "@alipay/o3-material";
import { Logger } from "@alipay/o3-base";

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
  leftTop: any;
  leftBottom: any;
  rightTop: any;
  rightBottom: any;
}

/**
 * Sprite渲染管理器
 * @class
 */
export class SpriteRenderer extends RenderableComponent {
  private _uvRect: IUvRect;
  private _worldSize: number[] = [];
  private _positionQuad: IPositionQuad;
  private _rotationAngle: number;
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
  public tintColor: number[] = [1, 1, 1, 1];
  public transformMatrix: any;

  /**
   * 构造函数
   * @param {Node} node
   * @param {Sprite} sprite
   */
  constructor(node, sprite) {
    super(node);

    const { texture, rect, anchor, worldSizeFactor } = sprite;
    this._worldSizeFactor = worldSizeFactor || 100;
    this.setTexture(texture);
    this.setRect(rect);
    this.setAnchor(anchor);
    this.setUvRect();
    this.setWorldSize();

    if (sprite.tintColor) {
      this.tintColor = sprite.tintColor;
    }

    // //-- Ability属性
    // this.renderable = true;

    //--
    this._positionQuad = {
      leftTop: vec3.create(),
      leftBottom: vec3.create(),
      rightTop: vec3.create(),
      rightBottom: vec3.create()
    };

    this._rotationAngle = 0;
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
   * @member {vec4}
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
   * @param {ACamera} camera
   */
  render(camera) {
    this._updatePositionQuad(camera);
    this._transformByMatrix();
    camera.sceneRenderer.pushSprite(
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
    const leftTop = vec4.set(
      vec4.create(),
      this._positionQuad.leftTop[0],
      this._positionQuad.leftTop[1],
      this._positionQuad.leftTop[2],
      1
    );
    const leftBottom = vec4.set(
      vec4.create(),
      this._positionQuad.leftBottom[0],
      this._positionQuad.leftBottom[1],
      this._positionQuad.leftBottom[2],
      1
    );

    const rightTop = vec4.set(
      vec4.create(),
      this._positionQuad.rightTop[0],
      this._positionQuad.rightTop[1],
      this._positionQuad.rightTop[2],
      1
    );
    const rightBottom = vec4.set(
      vec4.create(),
      this._positionQuad.rightBottom[0],
      this._positionQuad.rightBottom[1],
      this._positionQuad.rightBottom[2],
      1
    );
    vec4.transformMat4(leftTop, leftTop, matrix);
    vec4.transformMat4(leftBottom, leftBottom, matrix);
    vec4.transformMat4(rightTop, rightTop, matrix);
    vec4.transformMat4(rightBottom, rightBottom, matrix);
    this._positionQuad.leftTop = vec3.clone([leftTop[0], leftTop[1], leftTop[2]]);
    this._positionQuad.leftBottom = vec3.clone([leftBottom[0], leftBottom[1], leftBottom[2]]);
    this._positionQuad.rightTop = vec3.clone([rightTop[0], rightTop[1], rightTop[2]]);
    this._positionQuad.rightBottom = vec3.clone([rightBottom[0], rightBottom[1], rightBottom[2]]);
  }

  /**
   * 更新顶点位置
   * @param {ACamera} camera
   * @private
   */
  _updatePositionQuad(camera) {
    if (this.renderMode === "2D") {
      const m = camera.viewMatrix;
      const vx = vec3.fromValues(m[0], m[4], m[8]);
      const vy = vec3.fromValues(m[1], m[5], m[9]);
      //-- center pos
      const c = vec3.clone(this.node.worldPosition);
      const s = this._worldSize;
      const ns = this.node.scale;

      vec3.scale(vx, vx, s[0] * ns[0]);
      vec3.scale(vy, vy, s[1] * ns[1]);

      if (this._rotationAngle !== 0) {
        const vz = vec3.fromValues(m[2], m[6], m[10]);

        const rotation = quat.create();
        quat.setAxisAngle(rotation, vz, this._rotationAngle);

        vec3.transformQuat(vx, vx, rotation);
        vec3.transformQuat(vy, vy, rotation);
      }

      const cx = vec3.create();
      const cy = vec3.create();
      vec3.scale(cx, vx, (this.anchor[0] - 0.5) * 2);
      vec3.scale(cy, vy, (this.anchor[1] - 0.5) * 2);

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
      // console.log(3333, ns[0], leftTop, leftBottom);
    } else {
      // TODO: 3D
    }
  }
}
