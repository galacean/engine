import { vec2, vec3, vec4 } from '@alipay/r3-math';

const VectorPluginGenerator = ( count ) => {

  return ( tweener ) => {

    let result;
    switch( count ) {

      case 2:
        result = vec2.create();
        break;
      case 3:
        result = vec3.create();
        break;
      default:
        result = vec4.create();
        break;

    }
    const easing = tweener.options.easing;

    for ( let i = 0; i < count; i++ ) {

      let startValue = tweener.startValue[i];
      let offsetValue = tweener.endValue[i] - tweener.startValue[i];

      if ( tweener.rewind ) {

        startValue = tweener.endValue[i];
        offsetValue = tweener.startValue[i] - tweener.endValue[i];

      }

      result[i] =
        easing(
          tweener.elapsedTime,
          startValue,
          offsetValue,
          tweener.interval,
        );

    }

    tweener.setter( result );

  };

};

export default VectorPluginGenerator;
