import { IPhysicsMaterial } from "@galacean/engine-design";
import { Engine } from "../Engine";
import { PhysicsMaterialCombineMode } from "./enums/PhysicsMaterialCombineMode";
import { ignoreClone } from "../clone/CloneManager";

/**
 * Material class to represent a set of surface properties.
 */
export class PhysicsMaterial {
  private _bounciness = 0;
  private _dynamicFriction = 0.6;
  private _staticFriction = 0.6;
  private _bounceCombine: PhysicsMaterialCombineMode = PhysicsMaterialCombineMode.Average;
  private _frictionCombine: PhysicsMaterialCombineMode = PhysicsMaterialCombineMode.Average;
  private _destroyed: boolean;

  /** @internal */
  @ignoreClone
  _nativeMaterial: IPhysicsMaterial;

  constructor() {
    this._nativeMaterial = Engine._nativePhysics.createPhysicsMaterial(
      this._staticFriction,
      this._dynamicFriction,
      this._bounciness,
      this._frictionCombine,
      this._bounceCombine
    );
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

  /**
   * @internal
   */
  _cloneTo(target: PhysicsMaterial): void {
    target._syncNative();
  }

  /**
   * @internal
   */
  _syncNative(): void {
    const nativeMaterial = this._nativeMaterial;
    nativeMaterial.setStaticFriction(this._staticFriction);
    nativeMaterial.setDynamicFriction(this._dynamicFriction);
    nativeMaterial.setBounciness(this._bounciness);
    nativeMaterial.setFrictionCombine(this._frictionCombine);
    nativeMaterial.setBounceCombine(this._bounceCombine);
  }
}
