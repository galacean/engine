import { Node } from "@alipay/o3-core";
import { vec3, quat } from "@alipay/o3-math";
import { AnimationClipType } from "../AnimationConst";
import { Tween, Tweener, doTransform, Easing } from "@alipay/o3-tween";
import { AnimationClip } from "../AnimationClip";
import { AnimationClipHandler } from "./animationClipHandler";
import { LinkList } from "./linkList";
export class InterpolationHandler extends AnimationClipHandler {
  private keyFrameLinkListMap: { [key: string]: LinkList<any> };
  private tween: Tween;
  private originNodeState: Node;
  private curNodeState: Node;

  init() {
    super.init();
    const { animClip, node } = this;
    const { keyFrames } = animClip;
    this.tween = new Tween();
    this.keyFrameLinkListMap = {};
    this.originNodeState = node.clone();
    this.curNodeState = node.clone();
    this.curNodeState.rotation = quat.toEuler(vec3.create(), this.curNodeState.rotation);
    const keyFrameTimeQueue = Object.keys(animClip.keyFrames)
      .map(startTime => Number(startTime))
      .sort();
    keyFrameTimeQueue.forEach(keyFrameTime => {
      let keyFrameList = keyFrames[keyFrameTime];
      keyFrameList = keyFrameList.forEach(keyFrame => {
        const { property, subProperty } = keyFrame;
        const key = `${property}.${subProperty}`;
        keyFrame.keyFrameTime = keyFrameTime;
        this.keyFrameLinkListMap[key] = this.keyFrameLinkListMap[key] || new LinkList();
        this.keyFrameLinkListMap[key].append(keyFrame);
      });
    });
    this.generateTweener();
  }
  generateTweener() {
    const { tween, keyFrameLinkListMap, curNodeState } = this;
    const { DataType } = doTransform;
    const subPropertyMap = {
      x: 0,
      y: 1,
      z: 2
    };
    Object.keys(keyFrameLinkListMap).forEach(key => {
      let temp = key.split(".");
      const keyFrameLinkList = keyFrameLinkListMap[key];
      const property = temp[0];
      const subProperty = temp[1];
      let currentNode = keyFrameLinkList.head;
      while (currentNode !== null) {
        let startValue = curNodeState[property][subPropertyMap[subProperty]];
        let duration = currentNode.data.keyFrameTime;
        let delay = 0;
        const endValue = currentNode.data.value;
        if (currentNode.prev) {
          startValue = currentNode.prev.data.value;
          duration = currentNode.data.keyFrameTime - currentNode.prev.data.keyFrameTime;
          delay = currentNode.prev.data.keyFrameTime;
        }
        if (duration > 0) {
          const tweener = DataType(
            startValue,
            val => {
              curNodeState[property][subPropertyMap[subProperty]] = val;
            },
            endValue,
            duration,
            {
              easing: Easing["linear"],
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
    ["position", "rotation", "scale"].forEach(property => {
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
    ["position", "rotation", "scale"].forEach(property => {
      if (property === "rotation") {
        curNodeState[property] = quat.clone(originNodeState[property]);
      } else {
        curNodeState[property] = vec3.clone(originNodeState[property]);
      }
    });
    this.affectNode();
  }
}
