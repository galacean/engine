import { Vector3, Quaternion, MathUtil } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "./../Entity";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationEvent } from "./AnimationEvent";
import { Motion } from "./Motion";

export enum AnimateProperty {
  position,
  rotation,
  scale,
  other
}

export class AnimationClip extends Motion {
  private _length: number = 0; //时间
  events: AnimationEvent[];
  curves: AnimationClipCurveData<Component>[] = [];
  _clipStartTime: number;
  _clipEndTime: number;

  /**
   * @internal
   */
  set target(target: Entity) {
    this._target = target;
    if (target) {
      const { length } = this.curves;
      for (let i = length - 1; i >= 0; i--) {
        const { relativePath, propertyName } = this.curves[i];
        this.curves[i]._target = target.findByName(relativePath);
        this.curves[i]._defaultValue = this.curves[i]._target[propertyName];
      }
    }
  }
  /**
   * @constructor
   * @param name - The AnimationClip's name.
   */
  constructor(public readonly name: string) {
    super(null);
  }

  /**
   * @internal
   */
  _getTheRealFrameTime(frameTime: number) {
    if (frameTime < this._clipStartTime) {
      return this._clipStartTime;
    } else if (frameTime > this._clipEndTime) {
      return this._clipEndTime;
    } else {
      return frameTime;
    }
  }

  get length() {
    return this._length;
  }

  get clipStartTime() {
    return this._clipStartTime;
  }

  set clipStartTime(time: number) {
    this._clipStartTime = time;
    if (time > this._clipEndTime) {
      this._clipEndTime = time;
    }
  }

  get clipEndTime() {
    return this._clipEndTime;
  }

  set clipEndTime(time: number) {
    this._length = this._clipEndTime = time;
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
      const target = entity.findByName(relativePath);
      const transform = (<Entity>target).transform;
      switch (AnimateProperty[propertyName]) {
        case AnimateProperty.position:
          transform.position = val as Vector3;
          break;
        case AnimateProperty.rotation:
          transform.rotationQuaternion = val as Quaternion;
          break;
        case AnimateProperty.scale:
          transform.scale = val as Vector3;
          break;
      }
    }
  }

  addCurve(curveData: AnimationClipCurveData<Component>) {
    if (curveData.curve.length > this._length) {
      this._length = curveData.curve.length;
    }
    if (this.target) {
      curveData._target = this.target.findByName(curveData.relativePath);
      curveData._defaultValue = this.target[curveData.propertyName];
    }
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
