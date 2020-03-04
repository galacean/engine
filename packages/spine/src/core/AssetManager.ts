import { OasisTextrure } from "./OasisTexture";
import { spine } from "@alipay/spine-core";

export class AssetManager extends spine.AssetManager {
  private checkRaf;
  constructor(pathPrefix: string = "") {
    super((image: HTMLImageElement) => {
      return new OasisTextrure(image);
    }, pathPrefix);
  }

  onLoad() {
    return new Promise((resolve, reject) => {
      this.checkLoaded(resolve);
    });
  }

  checkLoaded(resolve) {
    if (this.toLoad == 0) {
      cancelAnimationFrame(this.checkRaf);
      resolve(this);
    } else {
      this.checkRaf = requestAnimationFrame(this.checkLoaded.bind(this, resolve));
    }
  }
}
