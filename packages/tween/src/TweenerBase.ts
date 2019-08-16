import {LOOP_TYPE} from './Enums';
import * as Easing from './Easing';

const noop = () => {
};

// on events
// play, pause, complete, kill, rewind, update
/**
 * TweenBase类
 * @class
 * @private
 */
class TweenerBase {

  protected _time;
  protected _paused;
  protected _remainLoops;
  protected _played;
  public options;
  public elapsedTime;
  public interval;
  public rewind;
  public preserved;
  public startValue;
  public endValue;
  public getter;
  public setter;

  constructor(getter, setter, endValue, interval, options = {}, target) {

    this.options = {
      id: '',
      loops: {
        // set -1 as infinite
        count: 0,
        type: LOOP_TYPE.Yoyo,
      },
      easing: Easing.linear,
      delay: 0,

      plugin: noop,
      pluginOptions: {},

      // callbacks
      onComplete: noop,
      onTick: noop,

      ...options,
    };

    this._time = 0;
    this._remainLoops = this.options.loops.count || 0;
    this._paused = true;
    this._played = false;
    this.rewind = false;
    this.preserved = false;

    this.elapsedTime = 0;
    this.startValue = getter();
    this.endValue = endValue;
    this.getter = getter;
    this.setter = setter;

    this.interval = interval;

  }

  duration() {
  }

  update(deltaTime) {
  }

  /**
   * 设置循环数
   * @param {number}  count 循环次数
   * @param {LOOP_TYPE} type 循环类型
   */
  setLoops(count, type = LOOP_TYPE.Yoyo) {

    this.options.loops = {count, type};
    // reset loop
    this._remainLoops = count;

    return this;

  }

  set(key, value) {

    this.options = {...this.options, ...{[key]: value}};

    return this;

  }

  stop() {

    this.options.onComplete(this);

    this._paused = true;

    return this;

  }

  pause() {

    if (this._paused) return false;
    this._paused = true;

    return this;

  }

  start(tweenManager) {

    if (tweenManager) {

      tweenManager.add(this);

    }

    if (!this._paused) return false;
    this.elapsedTime = 0;
    this._paused = false;
    this._played = true;

    return this;

  }

}

export {TweenerBase};
