export const FloatPlugin = tweener => {
  const easing = tweener.options.easing;

  const result = easing(
    tweener.elapsedTime,
    tweener.startValue,
    tweener.endValue - tweener.startValue,
    tweener.interval
  );

  tweener.setter(result);
};
