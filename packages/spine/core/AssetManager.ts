import { OasisTextrure } from './OasisTexture';
import { spine } from '@alipay/spine-core';

export class AssetManager extends spine.AssetManager {
  constructor (pathPrefix: string = "") {
    super((image: HTMLImageElement) => {
      return new OasisTextrure(image);
    }, pathPrefix);
  }
}
