import {LOOP_TYPE} from './Enums';
import {TweenerBase} from './TweenerBase';

const noop = () => {
};

// on events
// play, pause, complete, kill, rewind, update
/**
 * Tweener动画类
 * @extends TweenerBase
 */
class Tweener extends TweenerBase {

  /**
   * @constructor
   * @param {function} getter 获取函数
   * @param {function} setter 设置函数
   * @param {number} endValue 结束值
   * @param {number} interval 时间区间，以ms为单位
   * @param {Object} options 配置
   * @param target
   * @param {function} options.onComplete 完成时调用的函数
   */
  constructor(getter, setter, endValue, interval, options = {}, target = null) {

    super(getter, setter, endValue, interval, options, target);

  }

  /** 计算Tween动画总时长
   * @member {number}
   */
  duration() {

    // infinite
    let duration = 0;

    if (this.options.loops.count === -1) {

      duration = -1;

    } else {

      // FIXME: add rewind time
      duration = this.options.delay + this.options.loops.count * this.interval;

    }

    return duration;

  }

  /**
   * 更新tween中的状态,并检测动画是否要结束
   * @param {number} deltaTime 两帧之间的时间
   * @private
   */
  update(deltaTime) {

    this._time += deltaTime;

    if (!this._paused) {

      // if delay don't update
      if (this.options.delay > this._time) {

        return true;

      }

      this.elapsedTime += deltaTime;
      // in case deltaTime is really big
      this.elapsedTime = this.elapsedTime > this.interval ? this.interval : this.elapsedTime;

      // on start callback
      this.options.plugin(this);

      this.options.onTick(this);

      // everything has an end....
      if (this.elapsedTime === this.interval) {

        // loop it
        if (this._remainLoops > 0 || this._remainLoops <= -1) {

          switch (this.options.loops.type) {

            case LOOP_TYPE.Yoyo:
              this.rewind = !this.rewind;
              this.elapsedTime = 0;
              if (!this.rewind) {

                this._remainLoops--;

              }
              break;
            case LOOP_TYPE.Restart:
              // reset
              this.elapsedTime = 0;
              this._remainLoops--;
              break;

          }

        } else {

          this.stop();

        }

      }

      return true;

    }

  }

}

export {Tweener};
