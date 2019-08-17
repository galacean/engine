import { quat } from '@alipay/o3-math';

export const QuaternionPlugin = ( tweener ) => {

  const { easing } = tweener.options;

  const result = quat.create();

  const percent = easing( tweener.elapsedTime, 0, 1, tweener.interval );
  quat.slerp( result, tweener.startValue, tweener.endValue, percent );

  tweener.setter( result );

};
