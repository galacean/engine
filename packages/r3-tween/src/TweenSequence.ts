import { TweenerBase } from './TweenerBase';

class TweenSequence extends TweenerBase {

  public tweenersInfo;
  private _timePosition;
  public callbacksInfo;
  public currentTime;

  constructor( getter, setter, endValue, interval, options = {}, target ) {

    super( getter, setter, endValue, interval, options, target );

    this.tweenersInfo = [];
    this._timePosition = 0;
    this.callbacksInfo = [];

  }

  append( tweener ) {

    this.tweenersInfo.push( {
      timePosition: this._timePosition,
      tweener,
    } );

    if ( tweener.duration() > 0 ) {

      this._timePosition += tweener.duration();

    } else {
      // throw ERROR: do not support INF tweener
    }

    return this;

  }

  duration() {

    // calculate queue duration
    // FIXME: inserted tween time
    return this._timePosition + this.tweenersInfo[this.tweenersInfo.length - 1].tweener.duration();

  }

  insert( tweener, timePosition ) {

    this.tweenersInfo.push( {
      tweener,
      timePosition: timePosition,
    } );

    return this;

  }

  insertCallback( timePosition, callback ) {

    this.callbacksInfo.push( {
      timePosition,
      callback,
    } );

  }

  join( tweener ) {

    // get past tweener's time position
    const lastTweenerInfo = this.tweenersInfo[this.tweenersInfo.length - 1];

    this.tweenersInfo.push( {
      tweener,
      timePosition: lastTweenerInfo.timePosition,
    } );

    return this;

  }

  update( deltaTime ) {

    if ( !this._paused ) {

      this.currentTime += deltaTime;

      if ( this.currentTime < this.duration() ) {

        for ( let i = 0; i < this.tweenersInfo.length; i++ ) {

          // start tweener based on currentTime
          const currentTweenerInfo = this.tweenersInfo[i];

          if ( ( this.currentTime > currentTweenerInfo.timePosition )
            && currentTweenerInfo.tweener._paused
            && !currentTweenerInfo.tweener._played ) {

            currentTweenerInfo.tweener.start();

          }

          currentTweenerInfo.tweener.update( deltaTime );

        }

      } else {

        this.stop();

      }

    }

  }

}

export { TweenSequence };
