import { IRenderer } from "../../lottie-core/renderers/IRenderer";
import { ImageElement } from "../elements/imageElement";
export class Renderer extends IRenderer {
  [x: string]: any;
  constructor(animationItem, config) {
    super(animationItem, config);
  }

  createItem(layer) {
    let item: any = this.createNull();
    switch (layer.ty) {
      case 2:
        item = this.createImage(layer);
        break;
      case 0:
        item = this.createComp(layer);
        break;
      case 1:
        item = this.createSolid(layer);
        break;
      case 3:
        item = this.createNull();
        break;
      case 4:
        item = this.createShape(layer);
        break;
      case 5:
        item = this.createItem(layer);
        break;
      case 13:
        item = this.createCamera(layer);
        break;
    }
    if (item) {
      this.animationItem.node.addChild(item.node);
    }
    return item;
  }

  createShape(data) {}

  createText(data) {}

  createImage(data) {
    return new ImageElement(data, this.globalData, this);
  }

  createComp(data) {}

  createSolid(data) {}

  createNull() {}

  createCamera(data) {}
}
