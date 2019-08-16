const IntPlugin = {
  reset() {

  },

  /**
   *
   * @param tweener
   * @param value int
   * @returns int
   */
  startValue( tweener, value ) {

    return value;

  },

  // used in Incremental type LOOP_TYPE
  setRelativeEndValue( tweener ) {

    tweener.endValue += tweener.startValue;

  },

  setOffsetValue( tweener ) {

    tweener.offsetValue = tweener.endValue - tweener.startValue;

  },

  /**
   *
   * @param options
   * @param tweener Tweener
   * @param relative bool
   * @param getter
   * @param setter
   * @param elapsed
   * @param startValue
   * @param offsetValue
   * @param duration
   * @param inverse bool
   */
  apply( options, tweener, relative, getter, setter, elapsed, startValue, offsetValue, duration, inverse ) {

  },

};
