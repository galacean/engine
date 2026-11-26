import { Component } from "../Component";
import { ComponentConstructor, Entity } from "../Entity";
import { KeyframeValueType } from "./Keyframe";
import { AnimationCurve } from "./animationCurve";
import { IAnimationCurveCalculator } from "./animationCurve/interfaces/IAnimationCurveCalculator";
import { AnimationCurveLayerOwner } from "./internal/AnimationCurveLayerOwner";
import { AnimationCurveOwner } from "./internal/animationCurveOwner/AnimationCurveOwner";

// Keep the backing curve out of binding JSON
const curveKey = Symbol();

/**
 * Associate AnimationCurve and the Entity
 */
export class AnimationClipCurveBinding {
  /**
   * Path to the entity this curve applies to. The relativePath is formatted similar to a pathname,
   * e.g. "root/spine/leftArm". If relativePath is empty it refers to the entity the animation clip is attached to.
   */
  relativePath: string;
  /** The class type of the component that is animated. */
  type: ComponentConstructor;
  /** The index of the component that is animated. */
  typeIndex: number = 0;
  /**
   * The name or path to the property being animated.
   * @remarks support property:"a.b", array: "a.b[0]", method: "a.b('c', 0, $value)"
   */
  property: string;

  /**
   * The name or path to get the value when being animated.
   * @remarks support property:"a.b", array: "a.b[0]", method: "a.b('c', 0)"
   */
  getProperty?: string;
  private [curveKey]: AnimationCurve<KeyframeValueType> | undefined;
  private _lengthChangedListener: (() => void) | undefined;
  private _tempCurveOwner: WeakMap<Entity, AnimationCurveOwner<KeyframeValueType>> | undefined;

  /** The animation curve. */
  get curve(): AnimationCurve<KeyframeValueType> | undefined {
    return this[curveKey];
  }

  set curve(curve: AnimationCurve<KeyframeValueType> | undefined) {
    const previous = this[curveKey];
    if (curve === previous) return;
    const listener = this._lengthChangedListener;
    if (listener) previous?._removeLengthChangedListener(listener);
    this[curveKey] = curve;
    this._tempCurveOwner = undefined;
    if (listener) {
      curve?._addLengthChangedListener(listener);
      listener();
    }
  }

  /** @internal */
  _setLengthChangedListener(listener: (() => void) | undefined): void {
    const previous = this._lengthChangedListener;
    if (previous) this[curveKey]?._removeLengthChangedListener(previous);
    this._lengthChangedListener = listener;
    if (listener) this[curveKey]?._addLengthChangedListener(listener);
  }

  /**
   * @internal
   */
  _createCurveOwner(entity: Entity, component: Component): AnimationCurveOwner<KeyframeValueType> {
    const curveType = (<unknown>this.curve!.constructor) as IAnimationCurveCalculator<KeyframeValueType>;
    const owner = new AnimationCurveOwner(entity, this.type, component, this.property, this.getProperty, curveType);
    curveType._initializeOwner(owner);
    owner.saveDefaultValue();
    return owner;
  }

  /**
   * @internal
   */
  _createCurveLayerOwner(owner: AnimationCurveOwner<KeyframeValueType>): AnimationCurveLayerOwner {
    const curveType = (<unknown>this.curve!.constructor) as IAnimationCurveCalculator<KeyframeValueType>;
    const layerOwner = new AnimationCurveLayerOwner();
    layerOwner.curveOwner = owner;
    if (curveType._isCopyMode) curveType._initializeLayerOwner(layerOwner);
    // If curve.keyCount is 0, updateFinishedState will assign 0 to the target, causing an error, so initialize by assigning defaultValue to finalValue.
    layerOwner.initFinalValue();
    return layerOwner;
  }

  /**
   * @internal
   */
  _getTempCurveOwner(entity: Entity, component: Component): AnimationCurveOwner<KeyframeValueType> {
    const owners = (this._tempCurveOwner ??= new WeakMap());
    let owner = owners.get(entity);
    if (!owner) {
      owner = this._createCurveOwner(entity, component);
      owners.set(entity, owner);
    }
    return owner;
  }
}
