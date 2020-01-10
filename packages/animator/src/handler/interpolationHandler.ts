import { Node } from "@alipay/o3-core";
import { vec3, quat } from "@alipay/o3-math";
import { AnimationClipType } from "../AnimationConst";
import { Tween, Tweener, doTransform, Easing } from "@alipay/o3-tween";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";

export class InterpolationHandler extends AnimationClipHandler {
  keyFrameTimeTweenerMap: { [keyframeTime: number]: Tweener };
  intervalKeyFrameList: Array<[number, number, any, string[], boolean]>; //startTime endTime keyFrame isPlaying
  tween: Tween;
  originNodeState: { position: any[] | Float32Array; rotation: any[] | Float32Array; scale: any[] | Float32Array };
  constructor(id: number, type: AnimationClipType, node: Node, animClip: AnimationClip) {
    super(id, type, node, animClip);
    this.originNodeState = {
      position: vec3.clone(node["position"]),
      rotation: quat.clone(node["rotation"]),
      scale: vec3.clone(node["scale"])
    };
  }

  init() {
    super.init();
    const { animClip } = this;
    const { keyFrames } = animClip;
    this.tween = new Tween();
    const keyFrameTimeQueue = Object.keys(animClip.keyFrames)
      .map(startTime => Number(startTime))
      .sort();
    const subPropertyMap = { x: 0, y: 1, z: 2 };
    this.intervalKeyFrameList = [];
    let lastFrameTime = 0;
    let lastNodeState = this.originNodeState;
    keyFrameTimeQueue.forEach(keyFrameTime => {
      let keyFrameList = keyFrames[keyFrameTime];
      let currentNodeState = {
        position: vec3.clone(lastNodeState["position"]),
        rotation: quat.clone(lastNodeState["rotation"]),
        scale: vec3.clone(lastNodeState["scale"])
      };
      let changedList = [];
      keyFrameList = keyFrameList.forEach(keyFrame => {
        const { property, subProperty, value } = keyFrame;
        if (property === "rotation") {
          let euler = quat.toEuler(quat.create(), currentNodeState.rotation);
          euler[subPropertyMap[subProperty]] = value;
          quat.fromEuler(currentNodeState[property], euler[0], euler[1], euler[2]);
        } else {
          currentNodeState[property][subPropertyMap[subProperty]] = value;
        }
        changedList.push(property);
      });
      this.intervalKeyFrameList.push([lastFrameTime, keyFrameTime, currentNodeState, changedList, false]);
      lastFrameTime = keyFrameTime;
      lastNodeState = {
        position: vec3.clone(currentNodeState["position"]),
        rotation: quat.clone(currentNodeState["rotation"]),
        scale: vec3.clone(currentNodeState["scale"])
      };
    });
  }
  generateTweener(startTime: number, endTime: number, endValue: any, changedList: string[]) {
    const { node, tween } = this;
    const { Translate, Rotate, Scale } = doTransform;
    const duration = endTime - startTime;
    const transFuncMap = {
      position: Translate,
      rotation: Rotate,
      scale: Scale
    };
    changedList.forEach(property => {
      if (duration > 0) {
        const tweener = transFuncMap[property](node, endValue[property], duration, {
          easing: Easing["linear"]
        });
        tweener.start(tween);
      } else {
        //直接赋值
        if (property === "rotation") {
          node[property] = quat.clone(endValue[property]);
        } else {
          node[property] = vec3.clone(endValue[property]);
        }
      }
    });
  }

  update(deltaTime: number) {
    super.update(deltaTime);
    this.currentTime += deltaTime;
    this.intervalKeyFrameList.forEach(data => {
      const [startTime, endTime, endValue, changedList, isPlaying] = data;
      if (this.currentTime > startTime) {
        if (!isPlaying) {
          this.generateTweener(startTime, endTime, endValue, changedList);
          data[4] = true;
        }
      }
    });
    this.tween.update(deltaTime);
  }

  reset() {
    const { node, originNodeState } = this;
    super.reset();
    ["position", "rotation", "scale"].forEach(property => {
      if (property === "rotation") {
        node[property] = quat.clone(originNodeState[property]);
      } else {
        node[property] = vec3.clone(originNodeState[property]);
      }
    });
  }
}
