import { ASpriteRenderer } from "./ASpriteRenderer";

export class SpriteRenderer extends ASpriteRenderer {
  protected setRect(rect?) {
    try {
      if (rect) {
        this._rect = JSON.parse(rect);
      }
    } catch (error) {}
    if (!this._rect) {
      this._rect = {
        x: 0,
        y: 0,
        width: this._texture ? this._texture.image.width : 0,
        height: this.texture ? this._texture.image.height : 0
      };
    }
  }

  protected setTexture(texture) {
    // TODO：临时兼容Resource
    if (texture && texture.asset) {
      texture = texture.asset;
    }

    this._texture = texture;
  }
}
