import { AnimationCurve } from "./AnimationCurve";
import { Vector3, Quaternion } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "./../Entity";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationEvent } from "./AnimationEvent";
import { Motion } from "./Motion";
import { AnimateProperty } from "./enums/AnimateProperty";

/**
 * Stores keyframe based animations.
 */
export class AnimationClip extends Motion {
  /**
   * Animation Events for this animation clip.
   */
  events: AnimationEvent[];
  /**
   * @internal
   * Store a collection of Keyframes
   */
  _curves: AnimationClipCurveData<Component>[] = [];

  private _length: number = 0; //时间

  /** Animation length in seconds. */
  get length(): number {
    return this._length;
  }

  /**
   * @param name - The AnimationClip's name
   */
  constructor(public readonly name: string) {
    super(null);
  }

  /**
   * Adds an animation event to the clip.
   * @param event - The animation event
   */
  addEvent(event: AnimationEvent): void {
    this.events.push(event);
  }

  /**
   * Clears all events from the clip.
   */
  clearEvents(): void {
    const length = this.events.length;
    for (let i = length - 1; i >= 0; i--) {
      this.events[i] = null;
    }
    this.events = [];
  }

  /**
   * Samples an animation at a given time for any animated properties.
   * @param entity - The animated entity
   * @param time - The time to sample an animation
   */
  sampleAnimation(entity: Entity, time: number): void {
    const { length } = this._curves;
    for (let i = length - 1; i >= 0; i--) {
      const curveData = this._curves[i];
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
   * @param curveData - The curve data
   */
  setCurve<T extends Component>(
    relativePath: string,
    type: new (entity: Entity) => T,
    propertyName: string,
    curve: AnimationCurve
  ): void {
    const curveData: AnimationClipCurveData<Component> = {
      relativePath,
      type,
      propertyName,
      curve
    };
    if (curve.length > this._length) {
      this._length = curve.length;
    }
    if (this._target) {
      curveData._target = this._target.findByName(relativePath);
      curveData._defaultValue = this._target[propertyName];
    }
    this._curves.push(curveData);
  }

  /**
   * Remove a curve from the AnimationClip.
   * @param curve - The curve
   */
  removeCurve(curve: AnimationCurve): void {
    let deleteIndex = -1;
    const { length } = this._curves;
    for (let i = length - 1; i >= 0; i--) {
      if (this._curves[i].curve === curve) {
        deleteIndex = i;
      }
    }
    if (deleteIndex > -1) {
      this._curves.splice(deleteIndex, 1);
    }
  }

  /**
   * Clears all curves from the clip.
   */
  clearCurves(): void {
    const length = this.events.length;
    for (let i = length - 1; i >= 0; i--) {
      this._curves[i] = null;
    }
    this._curves = [];
    this._length = 0;
  }

  /** @internal */
  _setTarget(target: Entity) {
    this._target = target;
    if (target) {
      const { length } = this._curves;
      for (let i = length - 1; i >= 0; i--) {
        const { relativePath, propertyName } = this._curves[i];
        this._curves[i]._target = target.findByName(relativePath);
        this._curves[i]._defaultValue = this._curves[i]._target[propertyName];
      }
    }
  }
}
