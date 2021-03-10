import { Transform } from "./../Transform";
import { Component } from "../Component";
import { Entity } from "./../Entity";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationEvent } from "./types";
import { Motion } from "./Motion";

export enum AnimateProperty {
  position,
  rotation,
  scale,
  other
}

export class AnimationClip extends Motion {
  events: AnimationEvent[];
  curves: AnimationClipCurveData<Component>[] = [];
  /**
   * @constructor
   * @param name - The AnimationClip's name.
   */
  constructor(public readonly name: string) {
    super(null);
  }

  private _findChannelTarget(rootNode: Entity, target: any): Entity | Component {
    const targetID = target;
    let targetSceneObject: Entity = null;
    if (rootNode.name === targetID) {
      targetSceneObject = rootNode;
    } else {
      targetSceneObject = rootNode.findByName(targetID);
    }
    return targetSceneObject;
  }

  addEvent(evt: AnimationEvent) {
    this.events.push(evt);
  }
  removeEvent(index: number) {
    this.events.splice(index, 1);
  }

  clearEvents() {
    const length = this.events.length;
    for (let i = length - 1; i >= 0; i--) {
      this.events[i] = null;
    }
    this.events = [];
  }

  sampler(entity: Entity, time: number) {
    const { length } = this.curves;
    for (let i = length - 1; i >= 0; i--) {
      const curveData = this.curves[i];
      const { curve, propertyName, relativePath, type } = curveData;
      const val = curve.evaluate(time);
      const target = this._findChannelTarget(entity, relativePath);
      if (type === Transform) {
        const transform = (<Entity>target).transform;
        switch (AnimateProperty[propertyName]) {
          case AnimateProperty.position:
            transform.position = val;
            break;
          case AnimateProperty.rotation:
            transform.rotationQuaternion = val;
            break;
          case AnimateProperty.scale:
            transform.scale = val;
            break;
          default:
            target[propertyName] = val;
        }
      }
    }
  }

  addCurve(curveData: AnimationClipCurveData<Component>) {
    this.curves.push(curveData);
  }

  removeCurve(index: number) {
    this.curves.splice(index, 1);
  }

  clearCurves() {
    const length = this.events.length;
    for (let i = length - 1; i >= 0; i--) {
      this.curves[i] = null;
    }
    this.curves = [];
  }
}
