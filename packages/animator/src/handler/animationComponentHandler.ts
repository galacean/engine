import { Node } from "@alipay/o3-core";
import { vec3 } from "@alipay/o3-math";
import { AnimationClipType } from "../AnimationConst";
import { Tween, doTransform, Easing } from "@alipay/o3-tween";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";
const { Interpolation, Frame, Skelton, AnimationComponent } = AnimationClipType;

export class AnimationComponentHandler extends AnimationClipHandler {
  handler: any;
  type: AnimationClipType;
  animClip: AnimationClip;
  node: Node;
  currentTime: number;
  constructor(type: AnimationClipType, node: Node, animClip: AnimationClip) {
    super(type, node, animClip);
    this.init();
  }

  init() {
    const { node, animClip } = this;
    const { Translate, Rotate, Scale, DataType } = doTransform;
    const { keyFrames } = animClip;
    let tween = new Tween();
    let lastFrameTime = 0;
    const targetValueList = [];
    Object.keys(keyFrames)
      .sort()
      .forEach(time => {
        const keyFrameTime = Number(time);
        const keyFrameList = keyFrames[keyFrameTime];
        keyFrameList.forEach(keyFrame => {
          const { value, property, subProperty, interpolation } = keyFrame;
          const subPropertyMap = { x: 0, y: 1, z: 2 };
          const duration = keyFrameTime - lastFrameTime;
          const targetValue = {
            [property]: vec3.clone(this.node[property])
          };
          let endValue = vec3.clone(this.node[property]);
          endValue[subPropertyMap[subProperty]] = value;
          let tweenFunc = DataType;
          switch (property) {
            case "position":
              tweenFunc = Translate;
              break;
            case "rotation":
              tweenFunc = Rotate;
              break;
            case "Scale":
              tweenFunc = Scale;
              break;
          }
          if (duration > 0) {
            const tweener = tweenFunc(targetValue, endValue, duration, {
              easing: Easing[interpolation]
            });
            tweener.start(tween);
            targetValueList.push(targetValue);
          } else {
            this.node[property] = vec3.clone(targetValue[property]);
          }
        });
        lastFrameTime = Number(keyFrameTime);
      });

    const handler = {
      type: Interpolation,
      _handler: tween,
      targetValueList
    };
    this.handlerList.push(handler);
    return handler;
  }
  update() {}
}
