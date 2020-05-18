import { ASpriteRenderer } from "./ASpriteRenderer";
import { Logger } from "@alipay/o3-base";

export class SpriteRenderer extends ASpriteRenderer {
  protected setRect(rect?) {
    let rectObject;
    try {
      if (rect) {
        rectObject = JSON.parse(rect);
      }
    } catch (error) {
      Logger.warn("Rect is not valid JSON format");
    }
    super.setRect(rectObject);
  }

  protected setTexture(texture) {
    // TODO：临时兼容Resource
    if (texture && texture.asset) {
      texture = texture.asset;
    }

    this._texture = texture;
  }
}
