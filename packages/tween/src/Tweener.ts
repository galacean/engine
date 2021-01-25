import { LOOP_TYPE } from "./Enums";
import { TweenerBase } from "./TweenerBase";

const noop = () => {};

// on events
// play, pause, complete, kill, rewind, update
/**
 * Tweener class
 * @extends TweenerBase
 */
class Tweener extends TweenerBase {
  /**
   * @constructor
   * @param {function} getter - Getter function
   * @param {function} setter - Setter function
   * @param {number} endValue - End value
   * @param {number} interval - Time interval
   * @param {Object} options - Options
   * @param target
   * @param {function} options.onComplete - Completed callback function
   */
  constructor(getter, setter, endValue, interval, options = {}, target = null) {
    super(getter, setter, endValue, interval, options, target);
  }

  /** Calculate the total duration of Tween animation.
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
   * Update the state in the tween and detect whether the animation is about to end.
   * @param {number} deltaTime - Time between two frames
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

export { Tweener };
