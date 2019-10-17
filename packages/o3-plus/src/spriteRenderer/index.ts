import { ASpriteRenderer } from "@alipay/o3";

export class SpriteRenderer extends ASpriteRenderer {
  set rect (v) {
    try {
      const json = JSON.parse(v);
      this._sprite.spriteRect = json;
    } catch (error) {

    }
  }

  protected setTexture (texture) {
    // TODO：临时兼容Resource
    if (texture && texture.asset) {
      texture = texture.asset;
    }

    return texture;
  }
}
