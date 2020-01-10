import { AssetObject } from "@alipay/o3-core";

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class Animator extends AssetObject {
  _options: any;
  constructor(name: string, options: any) {
    super(name);
    this.options = options;
  }
  get options() {
    return this._options;
  }
  set options(options) {
    this._options = options;
  }
  onAttach() {}
}
