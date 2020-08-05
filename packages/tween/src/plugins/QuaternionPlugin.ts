import { Quaternion } from "@alipay/o3-math";

export const QuaternionPlugin = (tweener) => {
  const { easing } = tweener.options;

  const result = new Quaternion();

  const percent = easing(tweener.elapsedTime, 0, 1, tweener.interval);
  Quaternion.slerp(tweener.startValue, tweener.endValue, percent, result);

  tweener.setter(result);
};
