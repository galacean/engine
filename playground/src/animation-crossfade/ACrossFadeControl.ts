import { NodeAbility } from "@alipay/o3-core";
import { Logger } from "@alipay/o3-base";
/**
 * 指定范围内的往返运动
 */
export class ACrossFadeControl extends NodeAbility {
  public _animator: any;
  public _aniNames: any;
  public _aniDuration: any;
  public _aniTime: any;

  constructor(node, props) {
    super(node);

    this._animator = props.animator;
    this._aniNames = props.aniNames;

    this._aniDuration = 3;
    this._aniTime = 0;
  }

  update(deltaTime) {
    this._aniTime += deltaTime / 1000;
    if (this._aniTime > this._aniDuration) {
      this._aniTime = 0;

      let idx = Math.floor(Math.random() * this._aniNames.length);
      let name = this._aniNames[idx];
      this._animator.crossFade(name, 600);
    }
  }
}
