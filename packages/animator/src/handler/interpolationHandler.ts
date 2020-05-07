import { Node } from "@alipay/o3-core";
import { quat, vec3 } from "@alipay/o3-math";
import { doTransform, Easing, Tween } from "@alipay/o3-tween";
import { AnimationClipHandler } from "./animationClipHandler";
import { LinkList } from "./linkList";
export class InterpolationHandler extends AnimationClipHandler {
  private keyframeLinkListMap: { [key: string]: LinkList<any> };
  private tween: Tween;
  private originNodeState: Node;
  private curNodeState: Node;
  private changedProperty: any;
  init() {
    super.init();
    const { animClip, node } = this;
    const { keyframes } = animClip;
    this.tween = new Tween();
    this.changedProperty = {};
    this.keyframeLinkListMap = {};
    this.originNodeState = node.clone();
    this.curNodeState = node.clone();
    this.curNodeState.rotation = quat.toEuler(vec3.create(), this.curNodeState.rotation);
    const keyframeTimeQueue = Object.keys(animClip.keyframes)
      .map(startTime => Number(startTime))
      .sort((a, b) => a - b);
    keyframeTimeQueue.forEach(keyframeTime => {
      let keyframeList = keyframes[keyframeTime];
      keyframeList = keyframeList.forEach(keyframe => {
        const { property, subProperty } = keyframe;
        const key = `${property}.${subProperty}`;
        keyframe.keyframeTime = keyframeTime;
        this.keyframeLinkListMap[key] = this.keyframeLinkListMap[key] || new LinkList();
        this.keyframeLinkListMap[key].append(keyframe);
      });
    });
    this.generateTweener();
  }
  generateTweener() {
    const { tween, keyframeLinkListMap, curNodeState } = this;
    const { DataType } = doTransform;
    const subPropertyMap = {
      x: 0,
      y: 1,
      z: 2
    };
    Object.keys(keyframeLinkListMap).forEach(key => {
      let temp = key.split(".");
      const keyframeLinkList = keyframeLinkListMap[key];
      const property = temp[0];
      const subProperty = temp[1];
      let currentNode = keyframeLinkList.head;
      while (currentNode !== null) {
        const keyframeData = currentNode.data;
        let startValue = curNodeState[property][subPropertyMap[subProperty]];
        let duration = keyframeData.keyframeTime;
        let delay = 0;
        const { interpolation: interpolationStr } = keyframeData;
        const interpolation = interpolationStr.split(",");
        if (interpolation.length !== 4) {
          console.error("invalid bezier value");
        }
        const endValue = keyframeData.value;
        if (currentNode.prev) {
          const prevKeyframeData = currentNode.prev.data;
          startValue = prevKeyframeData.value;
          duration = keyframeData.keyframeTime - prevKeyframeData.keyframeTime;
          delay = prevKeyframeData.keyframeTime;
        }
        if (duration > 0) {
          const tweener = DataType(
            startValue,
            val => {
              curNodeState[property][subPropertyMap[subProperty]] = val;
              this.changedProperty[property] = true;
            },
            endValue,
            duration,
            {
              easing: Easing["bezierEasing"](interpolation[0], interpolation[1], interpolation[2], interpolation[3]),
              delay
            }
          );
          tweener.start(tween);
        } else {
          curNodeState[property][subPropertyMap[subProperty]] = endValue;
        }
        currentNode = currentNode.next;
      }
    });
  }

  update(deltaTime: number) {
    super.update(deltaTime);
    this.currentTime += deltaTime;
    this.tween.update(deltaTime);
    this.affectNode();
  }

  affectNode() {
    const { node, curNodeState } = this;
    Object.keys(this.changedProperty).forEach(property => {
      if (property === "rotation") {
        const euler = curNodeState[property];
        node[property] = quat.fromEuler(quat.create(), euler[0], euler[1], euler[2]);
      } else {
        node[property] = vec3.clone(curNodeState[property]);
      }
    });
  }

  reset() {
    const { curNodeState, originNodeState, tween } = this;
    super.reset();
    if (!curNodeState) return;
    Object.keys(this.changedProperty).forEach(property => {
      if (property === "rotation") {
        curNodeState[property] = quat.clone(originNodeState[property]);
      } else {
        curNodeState[property] = vec3.clone(originNodeState[property]);
      }
    });
    this.affectNode();
  }
}
