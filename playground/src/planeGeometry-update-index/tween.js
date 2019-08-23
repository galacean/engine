import { Tween, Tweener, Easing, doTransform, TweenPlugins } from '@alipay/o3-tween';
import { Engine, EngineFeature } from '@alipay/o3-core';

const tween = new Tween();

class TweenFeature extends EngineFeature {
  preTick(engine, currentScene) {
    tween.update(engine._time._deltaTime);
  }
}

Engine.registerFeature(TweenFeature);

const doTweenFloat = (startValue, endValue, setter, interval, options = {}) => {
  options.plugin = options.plugin || TweenPlugins.FloatPlugin;
  return new Tweener(() => startValue, setter, endValue, interval, options);
};

const doTweenVec3 = (startValue, endValue, setter, interval, options = {}) => {
  options.plugin = options.plugin || TweenPlugins.Vector3Plugin;
  return new Tweener(() => startValue, setter, endValue, interval, options);
};

export  { doTweenFloat, doTweenVec3, tween };
