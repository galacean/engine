import { IPhysicsMaterial, IPhysicsMaterialProperties } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { PhysicsMaterialCombineMode } from "./enums/PhysicsMaterialCombineMode";

/**
 * Material class to represent a set of surface properties.
 */
export class PhysicsMaterial {
  /** @internal */
  static readonly _defaultProperties: IPhysicsMaterialProperties = {
    staticFriction: 0.6,
    dynamicFriction: 0.6,
    bounciness: 0,
    frictionCombine: PhysicsMaterialCombineMode.Average,
    bounceCombine: PhysicsMaterialCombineMode.Average
  };

  private _bounciness = PhysicsMaterial._defaultProperties.bounciness;
  private _dynamicFriction = PhysicsMaterial._defaultProperties.dynamicFriction;
  private _staticFriction = PhysicsMaterial._defaultProperties.staticFriction;
  private _bounceCombine: PhysicsMaterialCombineMode = PhysicsMaterial._defaultProperties.bounceCombine;
  private _frictionCombine: PhysicsMaterialCombineMode = PhysicsMaterial._defaultProperties.frictionCombine;
  private _destroyed: boolean;

  /** @internal */
  _nativeMaterial: IPhysicsMaterial;

  constructor() {
    this._nativeMaterial = Engine._nativePhysics.createPhysicsMaterial(this);
  }

  /**
   * The coefficient of bounciness, ranging from 0 to 1.
   */
  get bounciness(): number {
    return this._bounciness;
  }

  set bounciness(value: number) {
    if (this._bounciness !== value) {
      this._bounciness = value;
      this._nativeMaterial.setBounciness(value);
    }
  }

  /**
   * The DynamicFriction value.
   */
  get dynamicFriction(): number {
    return this._dynamicFriction;
  }

  set dynamicFriction(value: number) {
    if (this._dynamicFriction !== value) {
      this._dynamicFriction = value;
      this._nativeMaterial.setDynamicFriction(value);
    }
  }

  /**
   * The coefficient of static friction.
   */
  get staticFriction(): number {
    return this._staticFriction;
  }

  set staticFriction(value: number) {
    if (this._staticFriction !== value) {
      this._staticFriction = value;
      this._nativeMaterial.setStaticFriction(value);
    }
  }

  /**
   * The restitution combine mode.
   */
  get bounceCombine(): PhysicsMaterialCombineMode {
    return this._bounceCombine;
  }

  set bounceCombine(value: PhysicsMaterialCombineMode) {
    if (this._bounceCombine !== value) {
      this._bounceCombine = value;
      this._nativeMaterial.setBounceCombine(value);
    }
  }

  /**
   * The friction combine mode.
   */
  get frictionCombine(): PhysicsMaterialCombineMode {
    return this._frictionCombine;
  }

  set frictionCombine(value: PhysicsMaterialCombineMode) {
    if (this._frictionCombine !== value) {
      this._frictionCombine = value;
      this._nativeMaterial.setFrictionCombine(value);
    }
  }

  /**
   * Destroy the material when the material is no be used by any shape.
   */
  destroy() {
    !this._destroyed && this._nativeMaterial.destroy();
    this._destroyed = true;
  }
}
