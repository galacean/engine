import { Quaternion, Vector3 } from "@oasis-engine/math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { Transform } from "../Transform";
import { AnimationClipCurveBinding } from "./AnimationClipCurveBinding";
import { AnimationCurve } from "./AnimationCurve";
import { AnimationEvent } from "./AnimationEvent";
import { AnimationProperty, AnimationPropertyInternal } from "./enums/AnimationProperty";

/**
 * Stores keyframe based animations.
 */
export class AnimationClip {
  /** @internal */
  _curveBindings: AnimationClipCurveBinding[] = [];

  private _length: number = 0;
  private _events: AnimationEvent[] = [];

  /**
   * Animation events for this animation clip.
   */
  get events(): Readonly<AnimationEvent[]> {
    return this._events;
  }

  /**
   * Animation curve bindings for this animation clip.
   */
  get curveBindings(): Readonly<AnimationClipCurveBinding[]> {
    return this._curveBindings;
  }

  /**
   * Animation length in seconds.
   */
  get length(): number {
    return this._length;
  }

  /**
   * @param name - The AnimationClip's name
   */
  constructor(public readonly name: string) {}

  /**
   * Adds an animation event to the clip.
   * @param functionName - The name of the method called in the script
   * @param time - The time when the event be triggered
   * @param parameter - The parameter that is stored in the event and will be sent to the function
   */
  addEvent(functionName: string, time: number, parameter: Object): void;

  /**
   * Adds an animation event to the clip.
   * @param event - The animation event
   */
  addEvent(event: AnimationEvent): void;

  addEvent(param: AnimationEvent | string, time?: number, parameter?: Object): void {
    if (typeof param === "string") {
      const event = new AnimationEvent();
      event.functionName = param;
      event.time = time;
      event.parameter = parameter;
      this._events.push(event);
    } else {
      this._events.push(param);
    }
    this._events.sort((a, b) => a.time - b.time);
  }

  /**
   * Clears all events from the clip.
   */
  clearEvents(): void {
    this._events.length = 0;
  }

  /**
   * Add curve binding for the clip.
   * @param relativePath - Path to the game object this curve applies to. The relativePath is formatted similar to a pathname, e.g. "/root/spine/leftArm"
   * @param type- The class type of the component that is animated
   * @param propertyName - The name or path to the property being animated.
   * @param curve - The animation curve
   */
  addCurveBinding<T extends Component>(
    relativePath: string,
    type: new (entity: Entity) => T,
    propertyName: string,
    curve: AnimationCurve
  ): void {
    let property: AnimationProperty;
    switch (propertyName) {
      case "position":
        property = AnimationPropertyInternal.Position;
        break;
      case "rotationQuaternion":
        property = AnimationPropertyInternal.Rotation;
        break;
      case "scale":
        property = AnimationPropertyInternal.Scale;
        break;
      case "blendShapeWeights":
        property = AnimationPropertyInternal.BlendShapeWeights;
        break;
      default:
        property = propertyName;
        break;
    }
    const curveBinding = new AnimationClipCurveBinding();
    curveBinding.relativePath = relativePath;
    curveBinding.type = type;
    curveBinding.property = property;
    curveBinding.curve = curve;
    if (curve.length > this._length) {
      this._length = curve.length;
    }
    this._curveBindings.push(curveBinding);
  }

  /**
   * Clears all curve bindings from the clip.
   */
  clearCurveBindings(): void {
    this._curveBindings.length = 0;
    this._length = 0;
  }

  /**
   * @internal
   * Samples an animation at a given time.
   * @param entity - The animated entity
   * @param time - The time to sample an animation
   */
  _sampleAnimation(entity: Entity, time: number): void {
    const { length } = this._curveBindings;
    for (let i = length - 1; i >= 0; i--) {
      const curveData = this._curveBindings[i];
      const { curve, property, relativePath, type } = curveData;
      const val = curve.evaluate(time);
      const target = entity.findByName(relativePath);
      const transform = (<Entity>target).transform;
      if (type === Transform) {
        switch (property) {
          case AnimationPropertyInternal.Position:
            transform.position = val as Vector3;
            break;
          case AnimationPropertyInternal.Rotation:
            transform.rotationQuaternion = val as Quaternion;
            break;
          case AnimationPropertyInternal.Scale:
            transform.scale = val as Vector3;
            break;
        }
      }
    }
  }
}
