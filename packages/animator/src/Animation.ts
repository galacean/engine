import { AssetObject } from "@alipay/o3-core";

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class Animation extends AssetObject {
  _keyFrames: any;
  _duration: number;
  constructor(name: string, props: any) {
    super(name);
    const { keyFrames, duration } = props;
    this.keyFrames = keyFrames;
    this.duration = duration;
  }
  get keyFrames() {
    return this._keyFrames;
  }
  set keyFrames(keyFrames) {
    this._keyFrames = keyFrames;
  }
  get duration() {
    return this._duration;
  }
  set duration(duration) {
    123213123, duration;
    this._duration = duration;
  }
}
