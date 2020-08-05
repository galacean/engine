import { Entity } from "@alipay/o3-core";
import { Quaternion, Vector3, Vector4, MathUtil } from "@alipay/o3-math";
import { doTransform, Easing, Tween } from "@alipay/o3-tween";
import { AnimationClipHandler } from "./animationClipHandler";
import { LinkList } from "./linkList";
import { NodeState } from "../types";

function cloneNodeState(entity: Entity): NodeState {
  return {
    position: entity.position.clone(),
    rotation: entity.rotation.clone(),
    scale: entity.scale.clone()
  };
}
export class InterpolationHandler extends AnimationClipHandler {
  private keyframeLinkListMap: { [key: string]: LinkList<any> };
  private tween: Tween;
  private originNodeState: NodeState;
  private curNodeState: NodeState;
  private changedProperty: any;
  init() {
    super.init();
    const { animClip, entity: node } = this;
    const { keyframes } = animClip;
    this.tween = new Tween();
    this.changedProperty = {};
    this.keyframeLinkListMap = {};
    this.originNodeState = cloneNodeState(node);
    this.curNodeState = cloneNodeState(node);
    Quaternion.toEuler(this.curNodeState.rotation, this.curNodeState.rotation);
    this.curNodeState.rotation.scale(MathUtil.RadToDegree); // 弧度转角度
    const keyframeTimeQueue = Object.keys(animClip.keyframes)
      .map((startTime) => Number(startTime))
      .sort((a, b) => a - b);
    keyframeTimeQueue.forEach((keyframeTime) => {
      let keyframeList = keyframes[keyframeTime];
      keyframeList = keyframeList.forEach((keyframe) => {
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
    Object.keys(keyframeLinkListMap).forEach((key) => {
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
            (val) => {
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
    const { entity: node, curNodeState } = this;
    Object.keys(this.changedProperty).forEach((property) => {
      if (property === "rotation") {
        const euler = curNodeState[property];
        Quaternion.fromEuler(
          MathUtil.degreeToRadian(euler[0]),
          MathUtil.degreeToRadian(euler[1]),
          MathUtil.degreeToRadian(euler[2]),
          node[property]
        );
      } else {
        node[property] = curNodeState[property].clone();
      }
    });
  }

  reset() {
    const { curNodeState, originNodeState, tween } = this;
    super.reset();
    if (!curNodeState) return;
    Object.keys(this.changedProperty).forEach((property) => {
      if (property === "rotation") {
        curNodeState[property] = originNodeState[property].clone();
      } else {
        curNodeState[property] = originNodeState[property].clone();
      }
    });
    this.affectNode();
  }
}
