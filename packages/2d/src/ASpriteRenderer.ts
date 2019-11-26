import { NodeAbility } from "@alipay/o3-core";
import { vec3, quat } from "@alipay/o3-math";
import { Sprite } from "./Sprite";

/**
 * Sprite渲染管理器
 * @class
 */
export class ASpriteRenderer extends NodeAbility {
  protected _sprite;

  private _positionQuad;

  private _rotationAngle;

  renderMode;

  tintColor;

  /**
   * 构造函数
   * @param {Node} node
   * @param {Sprite} sprite
   */
  constructor(node, sprite) {
    super(node);

    if (!(sprite instanceof Sprite)) {
      const { texture, rect, anchor } = sprite;
      sprite = new Sprite(this.setTexture(texture), rect, anchor);
    }

    //-- Ability属性
    this.renderable = true;

    //--
    this._sprite = sprite;
    this._positionQuad = {
      leftTop: vec3.create(),
      leftBottom: vec3.create(),
      rightTop: vec3.create(),
      rightBottom: vec3.create()
    };

    /**
     * 调节色，控制 Sprite 颜色变化
     * @member {vec4}
     */
    this.tintColor = [1, 1, 1, 1];

    /**
     * 渲染方式，2D或3D，默认是2D
     * TODO: 3D
     * @member {vec4}
     */
    this.renderMode = "2D";

    this._rotationAngle = 0;
  }

  protected setTexture(texture) {
    return texture;
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
   * 纹理对象
   */
  get texture() {
    return this._sprite.texture;
  }

  set texture(v) {
    v = this.setTexture(v);

    this._sprite.texture = v;
  }

  /**
   * 在纹理上面的像素区域
   */
  get rect() {
    return this._sprite.spriteRect;
  }

  set rect(v) {
    this._sprite.spriteRect = v;
  }

  /**
   * 锚点设置
   */
  get anchor() {
    return this._sprite.anchor;
  }

  set anchor(v) {
    this._sprite.anchor = v;
  }

  /**
   * 更新位置，将数据对象加入渲染队列
   * @param {ACamera} camera
   */
  render(camera) {
    if (!this._sprite) {
      return;
    }

    this._updatePositionQuad(camera);

    camera.sceneRenderer.pushSprite(
      this,
      this._positionQuad,
      this._sprite.uvRect,
      this.tintColor,
      this._sprite.texture,
      this.renderMode,
      camera
    );
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
      const s = this._sprite.worldSize;
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
      vec3.scale(cx, vx, (this._sprite.anchor[0] - 0.5) * 2);
      vec3.scale(cy, vy, (this._sprite.anchor[1] - 0.5) * 2);

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
    } else {
      // TODO: 3D
    }
  }
}
