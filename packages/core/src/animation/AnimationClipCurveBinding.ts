import { AnimationProperty } from "./enums/AnimationProperty";
import { Entity } from "../Entity";
import { Component } from "../Component";
import { AnimationCurve } from "./AnimationCurve";

/**
 * Associate AnimationCurve and the Entity
 */
export interface AnimationClipCurveBinding {
  /** Path to the entity this curve applies to. The relativePath is formatted similar to a pathname,
   * e.g. "root/spine/leftArm". If relativePath is empty it refers to the entity the animation clip is attached to. */
  relativePath: string;
  /** The class type of the component that is animated. */
  type: new (entity: Entity) => Component;
  /** The name or path to the property being animated. */
  property: AnimationProperty;
  /** The animation curve. */
  curve: AnimationCurve;
}
