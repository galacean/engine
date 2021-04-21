import { Vector3, Quaternion, MathUtil } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "./../Entity";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationEvent } from "./AnimationEvent";
import { Motion } from "./Motion";
import { AnimateProperty } from "./enums/AnimateProperty";

export class AnimationClip extends Motion {
  /**
   * Animation Events for this animation clip.
   */
  events: AnimationEvent[];
  curves: AnimationClipCurveData<Component>[] = [];

  /**
   * Animation length in seconds.
   */
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

  private _clipStartTime: number;
  private _clipEndTime: number;
  private _length: number = 0; //时间

  /**
   * @param name - The AnimationClip's name.
   */
  constructor(public readonly name: string) {
    super(null);
  }

  /**
   * Adds an animation event to the clip.
   * @param evt the animation event
   */
  addEvent(evt: AnimationEvent) {
    this.events.push(evt);
  }

  /**
   * Clears all events from the clip.
   */
  clearEvents() {
    const length = this.events.length;
    for (let i = length - 1; i >= 0; i--) {
      this.events[i] = null;
    }
    this.events = [];
  }

  /**
   * Samples an animation at a given time for any animated properties.
   * @param entity The animated entity.
   * @param time The time to sample an animation.
   */
  sampleAnimation(entity: Entity, time: number): void {
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

  /**
   * Assigns the curve to animate a specific property.
   * @param curveData
   */
  setCurve(curveData: AnimationClipCurveData<Component>): void {
    if (curveData.curve.length > this._length) {
      this._length = curveData.curve.length;
    }
    if (this._target) {
      curveData._target = this._target.findByName(curveData.relativePath);
      curveData._defaultValue = this._target[curveData.propertyName];
    }
    this.curves.push(curveData);
  }

  /**
   * Clears all curves from the clip.
   */
  clearCurves(): void {
    const length = this.events.length;
    for (let i = length - 1; i >= 0; i--) {
      this.curves[i] = null;
    }
    this.curves = [];
  }

  /**
   * @internal
   */
  _setTarget(target: Entity) {
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
}
