import { EngineObject } from "../base/EngineObject";
import { Component } from "../Component";
import { ComponentConstructor, Entity } from "../Entity";
import { UpdateFlagManager } from "../UpdateFlagManager";
import { AnimationClipCurveBinding } from "./AnimationClipCurveBinding";
import { AnimationCurve } from "./animationCurve/AnimationCurve";
import { AnimationEvent } from "./AnimationEvent";
import { AnimationCurveOwner } from "./internal/animationCurveOwner/AnimationCurveOwner";
import { KeyframeValueType } from "./Keyframe";

/**
 * Stores keyframe based animations.
 */
export class AnimationClip extends EngineObject {
  /** @internal */
  _curveBindings: AnimationClipCurveBinding[] = [];

  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  private _length = { value: 0 };
  private _invalidateLength = AnimationClip._createLengthInvalidator(this._length);
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
    const cache = this._length;
    if (cache.value < 0) {
      let length = 0;
      for (const binding of this._curveBindings) {
        length = Math.max(length, binding.curve?.length ?? 0);
      }
      cache.value = length;
    }
    return cache.value;
  }

  /**
   * @param name - The AnimationClip's name
   */
  constructor(public readonly name: string) {
    super(null!);
  }

  /**
   * Adds an animation event to the clip.
   * @param functionName - The name of the method called in the script
   * @param time - The time when the event be triggered
   * @param parameter - The parameter that is stored in the event and will be sent to the function
   */
  addEvent(functionName: string, time: number, parameter: object): void;

  /**
   * Adds an animation event to the clip.
   * @param event - The animation event
   */
  addEvent(event: AnimationEvent): void;

  addEvent(param: AnimationEvent | string, time?: number, parameter?: object): void {
    let newEvent: AnimationEvent;
    if (typeof param === "string") {
      const event = new AnimationEvent();
      event.functionName = param;
      event.time = time;
      event.parameter = parameter;
      newEvent = event;
    } else {
      newEvent = param;
    }
    const events = this._events;
    const count = events.length;
    const eventTime = newEvent.time!;
    const maxEventTime = count ? events[count - 1].time! : 0;
    if (eventTime >= maxEventTime) {
      events.push(newEvent);
    } else {
      let index = count;
      while (--index >= 0 && eventTime < events[index].time!);
      events.splice(index + 1, 0, newEvent);
    }

    this._updateFlagManager.dispatch();
  }

  /**
   * Clears all events from the clip.
   */
  clearEvents(): void {
    this._events.length = 0;
    this._updateFlagManager.dispatch();
  }

  /**
   * Add curve binding for the clip.
   * @param entityPath - Path to the game object this curve applies to. The entityPath is formatted similar to a pathname, e.g. "/root/spine/leftArm"
   * @param componentType - The class type of the component that is animated
   * @param propertyPath - The path to the property being animated, support "a.b" and "a.b[x]" description mode
   * @param curve - The animation curve
   */
  addCurveBinding<T extends Component>(
    entityPath: string,
    componentType: ComponentConstructor<T>,
    propertyPath: string,
    curve: AnimationCurve<KeyframeValueType>
  ): void;

  /**
   * Add curve binding for the clip.
   * @param entityPath - Path to the game object this curve applies to. The entityPath is formatted similar to a pathname, e.g. "/root/spine/leftArm"
   * @param componentType - The class type of the component that is animated
   * @param setPropertyPath - The path to set the property being animated, support "a.b", "a.b[x]" and "a.b('c', 0, $value)" description mode
   * @param getPropertyPath - The path to get the value when being animated, support "a.b", "a.b[x]" and "a.b('c', 0, $value)" description mode
   * @param curve - The animation curve
   */
  addCurveBinding<T extends Component>(
    entityPath: string,
    componentType: ComponentConstructor<T>,
    setPropertyPath: string,
    getPropertyPath: string,
    curve: AnimationCurve<KeyframeValueType>
  ): void;

  /**
   * Add curve binding for the clip.
   * @param entityPath - Path to the game object this curve applies to. The entityPath is formatted similar to a pathname, e.g. "/root/spine/leftArm"
   * @param componentType - The type index of the component that is animated
   * @param componentIndex - The class type of the component that is animated
   * @param propertyPath - The path to the property being animated, support "a.b" and "a.b[x]" description mode
   * @param curve - The animation curve
   */
  addCurveBinding<T extends Component>(
    entityPath: string,
    componentType: ComponentConstructor<T>,
    componentIndex: number,
    propertyPath: string,
    curve: AnimationCurve<KeyframeValueType>
  ): void;

  /**
   * Add curve binding for the clip.
   * @param entityPath - Path to the game object this curve applies to. The entityPath is formatted similar to a pathname, e.g. "/root/spine/leftArm"
   * @param componentType - The class type of the component that is animated
   * @param componentIndex - The class type of the component that is animated
   * @param setPropertyPath - The path to set the property being animated, support "a.b", "a.b[x]" and "a.b('c', 0, $value)" description mode
   * @param getPropertyPath - The path to get the value when being animated, support "a.b", "a.b[x]" and "a.b('c', 0, $value)" description mode
   * @param curve - The animation curve
   */
  addCurveBinding<T extends Component>(
    entityPath: string,
    componentType: ComponentConstructor<T>,
    componentIndex: number,
    setPropertyPath: string,
    getPropertyPath: string,
    curve: AnimationCurve<KeyframeValueType>
  ): void;

  addCurveBinding<T extends Component>(
    entityPath: string,
    componentType: ComponentConstructor<T>,
    propertyOrSetPropertyPathOrComponentIndex: number | string,
    curveOrSetPropertyPathOrGetPropertyPath: AnimationCurve<KeyframeValueType> | string,
    curveOrGetPropertyPath?: AnimationCurve<KeyframeValueType> | string,
    curve?: AnimationCurve<KeyframeValueType>
  ): void {
    const curveBinding = new AnimationClipCurveBinding();
    curveBinding.relativePath = entityPath;
    curveBinding.type = componentType;

    if (typeof propertyOrSetPropertyPathOrComponentIndex === "number") {
      curveBinding.typeIndex = propertyOrSetPropertyPathOrComponentIndex;
      curveBinding.property = <string>curveOrSetPropertyPathOrGetPropertyPath;
      if (typeof curveOrGetPropertyPath === "string") {
        curveBinding.getProperty = curveOrGetPropertyPath;
        curveBinding.curve = curve;
      } else {
        curveBinding.curve = curveOrGetPropertyPath;
      }
    } else {
      curveBinding.property = propertyOrSetPropertyPathOrComponentIndex;
      if (typeof curveOrSetPropertyPathOrGetPropertyPath === "string") {
        curveBinding.getProperty = curveOrSetPropertyPathOrGetPropertyPath;
        curveBinding.curve = <AnimationCurve<KeyframeValueType>>curveOrGetPropertyPath;
      } else {
        curveBinding.curve = curveOrSetPropertyPathOrGetPropertyPath;
      }
    }

    curveBinding._setLengthChangedListener(this._invalidateLength);
    const cache = this._length;
    if (cache.value >= 0) {
      cache.value = Math.max(cache.value, curveBinding.curve!.length);
    }
    this._curveBindings.push(curveBinding);
  }

  /**
   * Clears all curve bindings from the clip.
   */
  clearCurveBindings(): void {
    const bindings = this._curveBindings;
    for (const binding of bindings) {
      binding._setLengthChangedListener(undefined);
    }
    bindings.length = 0;
    this._length.value = 0;
  }

  /**
   * Samples an animation at a given time.
   * @param entity - The animated entity
   * @param time - The time to sample an animation
   */
  sampleAnimation(entity: Entity, time: number): void {
    const { _curveBindings: curveBindings } = this;
    const components = AnimationCurveOwner._components;
    for (let i = curveBindings.length - 1; i >= 0; i--) {
      const binding = curveBindings[i];
      const curve = binding.curve;
      if (!curve?.keyCount) continue;
      const targetEntity = entity.findByPath(binding.relativePath);
      if (targetEntity) {
        const component =
          binding.typeIndex > 0
            ? targetEntity.getComponents(binding.type, components)[binding.typeIndex]
            : targetEntity.getComponent(binding.type);
        components.length = 0;
        if (!component) {
          continue;
        }
        const curveOwner = binding._getTempCurveOwner(targetEntity, component);
        const value = curveOwner.evaluateValue(curve, time, false);
        curveOwner.applyValue(value!, 1, false);
      }
    }
  }

  protected override _onDestroy(): void {
    this.clearCurveBindings();
    super._onDestroy();
  }

  private static _createLengthInvalidator(cache: { value: number }): () => void {
    // A retained curve should not hold its clip and the other curves alive
    return () => {
      cache.value = -1;
    };
  }
}
