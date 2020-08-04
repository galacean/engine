import { AssetObject } from "@alipay/o3-core";

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class AnimationAsset extends AssetObject {
  _keyframes: any;
  _duration: number;
  constructor(name: string, props: any) {
    super();
    const { keyframes, duration } = props;
    this.keyframes = keyframes;
    this.duration = duration;
  }
  get keyframes() {
    return this._keyframes;
  }
  set keyframes(keyframes) {
    this._keyframes = keyframes;
  }
  get duration() {
    return this._duration;
  }
  set duration(duration) {
    this._duration = duration;
  }
}
