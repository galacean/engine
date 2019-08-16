import { NodeAbility } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import { doTweenVec3, tween } from './tween';
import { Easing } from '@alipay/r3-tween';

// 自定义组件必须继承自 NodeAbility
export class APerspective extends NodeAbility {
  constructor(node) {
    super(node);
    const aCamera = this.node.findAbilityByType(ADefaultCamera);
    this.target = [0, 0, 0];
    this.deltaPos = [0, 0, 0];
    this.radio = 0.02;
    this.canvas = aCamera.canvas;
    this.moveTweener = null;
    this._tweenerId = 0;
    this.delayTime = 300;
    this.needUpdate = false;
    this.center = [this.canvas.clientWidth / 2, this.canvas.clientHeight / 2];
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this), false);
  }

  onMouseMove(e) {
    e.preventDefault();
    e.stopPropagation();
    this.deltaPos[0] = (e.clientX - this.center[0]) * this.radio;
    this.deltaPos[1] = -(e.clientY - this.center[1]) * this.radio;
    this.needUpdate = true;
  }

  update(deltaTime) {
    if(this.needUpdate) {
      if(this.moveTweener) {
        this._deleteTweener(this.moveTweener.id);
        this.moveTweener = null;
      }
      this.moveTweener = doTweenVec3(this.target.slice(0), this.deltaPos, (value) => {
        this.node.lookAt( value, [0, 1, 0] );
        this.target = value;
      }, this.delayTime, {
        easing: Easing.easeOutQuad,
      }).start(tween);
      this.moveTweener.id = this._getId();
      this.needUpdate = false;
    }
  }

  _getId() {
    return 'aa' + this._tweenerId++;
  }

  _deleteTweener(id) {
    let tweeners = tween.tweeners;
    if(tweeners) {
      delete tweeners[id];
    }
  }

  destroy() {
    super.destroy();
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
  }
}
