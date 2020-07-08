import { Node } from "@alipay/o3-core";
import { SpriteRenderer } from "@alipay/o3-2d";
import { IImageElement } from "../../lottie-core/elements/IElements/IImageElement";
let nodeCount = 0;
export class ImageElement extends IImageElement {
  node: any;
  renderer: any;
  img: any;
  assetData: any;
  constructor(data, globalData, comp) {
    super();
    this.assetData = globalData.getAssetData(data.refId);
    this.img = globalData.resources[this.assetData.id];
    this.initElement(data, globalData, comp);
  }

  initElement(data, globalData, comp) {
    super.initElement(data, globalData, comp);
  }

  createContainerElements() {
    this.node = new Node(null, null, `LOTTIE_IMAGE_${nodeCount++}`);
  }
  createContent() {
    super.createContent();
    this.renderer = this.node.createAbility(SpriteRenderer, {
      texture: this.img.asset,
      anchor: [0, 0],
      worldSizeFactor: 2
    });
  }
  setTransform(matrix) {
    matrix[1] = matrix[1] * -1;
    matrix[4] = matrix[4] * -1;
    matrix[12] = matrix[12];
    matrix[13] = -matrix[13];
    // this.node.setModelMatrixNew(matrix);
    this.renderer.transformMatrix = matrix;
  }

  setOpacity(opacity) {
    this.renderer.tintColor = [1, 1, 1, opacity];
  }

  destroy() {
    this.img = null;
  }
}
