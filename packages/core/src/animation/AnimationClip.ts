import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { Transform } from "../Transform";
import { AnimationClipCurveData } from "./AnimationClipCurveData";
import { AnimationCurve } from "./AnimationCurve";
import { AnimationEvent } from "./AnimationEvent";
import { AnimationProperty } from "./enums/AnimationProperty";
import { Motion } from "./Motion";

/**
 * Stores keyframe based animations.
 */
export class AnimationClip extends Motion {
  /** @internal */
  _curves: AnimationClipCurveData<Component>[] = [];

  private _length: number = 0;
  private _events: AnimationEvent[] = [];

  /**
   * Animation events for this animation clip.
   */
  get events(): Readonly<AnimationEvent[]> {
    return this._events;
  }

  /**
   * Animation curves for this animation clip.
   */
  get curves(): Readonly<AnimationClipCurveData<Component>[]> {
    return this._curves;
  }

  /** Animation length in seconds. */
  get length(): number {
    return this._length;
  }

  /**
   * @param name - The AnimationClip's name
   */
  constructor(public readonly name: string) {
    super();
  }

  /**
   * Adds an animation event to the clip.
   * @param event - The animation event
   */
  addEvent(event: AnimationEvent): void {
    this._events.push(event);
    this._events.sort((a, b) => a.time - b.time);
  }

  /**
   * Clears all events from the clip.
   */
  clearEvents(): void {
    this._events.length = 0;
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
      case "blendShapeWeights":
        property = AnimationProperty.BlendShapeWeights;
        break;
      default:
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
   * Clears all curves from the clip.
   */
  clearCurves(): void {
    this._curves.length = 0;
    this._length = 0;
  }

  /**
   * @internal
   * Samples an animation at a given time.
   * @param entity - The animated entity
   * @param time - The time to sample an animation
   */
  _sampleAnimation(entity: Entity, time: number): void {
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
}
