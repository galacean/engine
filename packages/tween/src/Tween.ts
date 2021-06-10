/**
 * Tween class
 * @class
 */
class Tween {
  private _nextId;
  public tweeners;
  /**
   * @constructor
   */
  constructor() {
    this._nextId = 0;
    this.tweeners = {};
  }

  /**
   * Next id.
   * @member {number}
   */
  getId() {
    return this._nextId++;
  }

  /**
   * Add keyframe.
   * @param tweener - Keyframe
   */
  add(tweener) {
    if (!tweener.id) {
      tweener.id = this.getId();
    }
    this.tweeners[tweener.id] = tweener;
  }

  /**
   * Update the internal state of the tween and delete the key frames that have been played and are not needed.
   * @param {number} deltaTime - Time between two frames
   */
  update(deltaTime) {
    for (const tweenerId in this.tweeners) {
      const tweener = this.tweeners[tweenerId];

      tweener.update(deltaTime);

      // remove unused tweener
      if (tweener._played && tweener._paused && !tweener.preserved) {
        delete this.tweeners[tweenerId];
      }
    }
  }
}

export { Tween };
