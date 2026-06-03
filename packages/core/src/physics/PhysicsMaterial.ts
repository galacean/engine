import { IPhysicsMaterial } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { PhysicsMaterialCombineMode } from "./enums/PhysicsMaterialCombineMode";
import { property } from "../clone/CloneManager";

/**
 * Material class to represent a set of surface properties.
 */
export class PhysicsMaterial {
  @property
  private _bounciness = 0;
  @property
  private _dynamicFriction = 0.6;
  @property
  private _staticFriction = 0.6;
  @property
  private _bounceCombine: PhysicsMaterialCombineMode = PhysicsMaterialCombineMode.Average;
  @property
  private _frictionCombine: PhysicsMaterialCombineMode = PhysicsMaterialCombineMode.Average;
  private _destroyed: boolean;

  /** @internal */
  _nativeMaterial: IPhysicsMaterial;

  constructor() {
    this._nativeMaterial = Engine._nativePhysics.createPhysicsMaterial(
      this._staticFriction,
      this._dynamicFriction,
      this._bounciness,
      this._bounceCombine,
      this._frictionCombine
    );
  }

  /**
   * @internal
   * Sync the cloned JS values into the clone's own native material — populate writes the `@property`
   * fields directly, bypassing the setters that normally push into native.
   */
  _cloneTo(target: PhysicsMaterial): void {
    const nativeMaterial = target._nativeMaterial;
    nativeMaterial.setBounciness(this._bounciness);
    nativeMaterial.setDynamicFriction(this._dynamicFriction);
    nativeMaterial.setStaticFriction(this._staticFriction);
    nativeMaterial.setBounceCombine(this._bounceCombine);
    nativeMaterial.setFrictionCombine(this._frictionCombine);
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
