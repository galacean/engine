import { Vector2, Vector3, Vector4 } from "@alipay/o3";

const handleVecComp = (tweener, comp: string, result: Vector2 | Vector3 | Vector4) => {
  const easing = tweener.options.easing;

  let startValue = tweener.startValue[comp];
  let offsetValue = tweener.endValue[comp] - tweener.startValue[comp];

  if (tweener.rewind) {
    startValue = tweener.endValue[comp];
    offsetValue = tweener.startValue[comp] - tweener.endValue[comp];
  }

  result[comp] = easing(tweener.elapsedTime, startValue, offsetValue, tweener.interval);
};

const VectorPluginGenerator = (count) => {
  return (tweener) => {
    let result;
    switch (count) {
      case 2:
        result = new Vector2();
        handleVecComp(tweener, "x", result);
        handleVecComp(tweener, "y", result);
        break;
      case 3:
        result = new Vector3();
        handleVecComp(tweener, "x", result);
        handleVecComp(tweener, "y", result);
        handleVecComp(tweener, "z", result);
        break;
      default:
        result = new Vector4();
        handleVecComp(tweener, "x", result);
        handleVecComp(tweener, "y", result);
        handleVecComp(tweener, "z", result);
        handleVecComp(tweener, "w", result);
        break;
    }

    tweener.setter(result);
  };
};

export default VectorPluginGenerator;
