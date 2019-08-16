/**
 * Tween类
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
   * 下一个id
   * @member {number}
   * @readonly
   */
  getId() {

    return this._nextId++;

  }

  /**
   * 增加关键帧
   * @param {Object} tweener 关键帧
   */
  add( tweener ) {

    if( !tweener.id ) {

      tweener.id = this.getId();

    }
    this.tweeners[tweener.id] = tweener;

  }


  /**
   * 更新tween内部的状态,删除已经播放过且不需要的关键帧
   * @param {number}  deltaTime 两帧之间的时间
   */
  update( deltaTime ) {

    for ( const tweenerId in this.tweeners ) {

      const tweener = this.tweeners[tweenerId];

      tweener.update( deltaTime );

      // remove unused tweener
      if ( tweener._played && tweener._paused && !tweener.preserved ) {

        delete this.tweeners[tweenerId];

      }

    }

  }

}

export { Tween };
