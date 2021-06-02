import { Transform } from "../Transform";
import { AnimationCurve } from "./AnimationCurve";
import { Vector3, Quaternion } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationEvent } from "./AnimationEvent";
import { Motion } from "./Motion";
import { AnimationProperty } from "./enums/AnimationProperty";

/**
 * Stores keyframe based animations.
 */
export class AnimationClip extends Motion {
  /** Animation Events for this animation clip. */
  events: AnimationEvent[];

  /**
   * @internal
   * Store a collection of Keyframes
   */
  _curves: AnimationClipCurveData<Component>[] = [];

  private _length: number = 0;

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
      const { curve, property, relativePath, type } = curveData;
      const val = curve.evaluate(time);
      const target = entity.findByName(relativePath);
      const transform = (<Entity>target).transform;
      if (type === Transform) {
        switch (property) {
          case AnimationProperty.Position:
            transform.position = val as Vector3;
            break;
          case AnimationProperty.Rotation:
            transform.rotationQuaternion = val as Quaternion;
            break;
          case AnimationProperty.Scale:
            transform.scale = val as Vector3;
            break;
        }
      }
    }
  }

  /**
   * Assigns the curve to animate a specific property.
   * @param relativePath - Path to the game object this curve applies to. The relativePath is formatted similar to a pathname, e.g. "/root/spine/leftArm"
   * @param type- The class type of the component that is animated
   * @param propertyName - The name to the property being animated
   * @param curve - The animation curve
   */
  setCurve<T extends Component>(
    relativePath: string,
    type: new (entity: Entity) => T,
    propertyName: string,
    curve: AnimationCurve
  ): void {
    let property: AnimationProperty;
    switch (propertyName) {
      case "position":
        property = AnimationProperty.Position;
        break;
      case "rotation":
        property = AnimationProperty.Rotation;
        break;
      case "scale":
        property = AnimationProperty.Scale;
        break;
    }
    const curveData: AnimationClipCurveData<Component> = {
      relativePath,
      type,
      property,
      curve
    };
    if (curve.length > this._length) {
      this._length = curve.length;
    }
    this._curves.push(curveData);
  }

  /**
   * Remove a curve from the AnimationClip.
   * @param curve - The curve
   */
  removeCurve(curve: AnimationCurve): void {
    let deleteIndex = -1;
    const { length: count } = this._curves;
    let newLength = 0;
    for (let i = count - 1; i >= 0; i--) {
      const theCurve = this._curves[i].curve;
      if (theCurve === curve) {
        deleteIndex = i;
      } else {
        if (theCurve.length > newLength) {
          newLength = theCurve.length;
        }
      }
    }
    if (deleteIndex > -1) {
      this._curves.splice(deleteIndex, 1);
    }
    this._length = newLength;
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
}
