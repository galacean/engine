import { IPhysicsMaterial } from "@galacean/engine-design";
import { ReferResource } from "../asset/ReferResource";
import { Engine } from "../Engine";
import { PhysicsMaterialCombineMode } from "./enums/PhysicsMaterialCombineMode";

/**
 * Material class to represent a set of surface properties.
 * @remarks Coefficients must be finite. Bounciness is clamped to [0, 1], and friction is clamped to non-negative values.
 */
export class PhysicsMaterial extends ReferResource {
  private _bounciness = 0;
  private _dynamicFriction = 0.6;
  private _staticFriction = 0.6;
  private _bounceCombine: PhysicsMaterialCombineMode = PhysicsMaterialCombineMode.Average;
  private _frictionCombine: PhysicsMaterialCombineMode = PhysicsMaterialCombineMode.Average;
  /** @internal */
  _nativeMaterial: IPhysicsMaterial;

  /**
   * Create a physics material.
   * @param engine - Owner for resource caching and garbage collection. When omitted, the material can
   * be shared across engines using the same physics backend and is destroyed when its last shape releases it.
   */
  constructor(engine?: Engine) {
    super(engine ?? null);
    try {
      this._nativeMaterial = Engine._nativePhysics.createPhysicsMaterial(
        this._staticFriction,
        this._dynamicFriction,
        this._bounciness,
        this._frictionCombine,
        this._bounceCombine
      );
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /**
   * The coefficient of bounciness, ranging from 0 to 1.
   */
  get bounciness(): number {
    return this._bounciness;
  }

  set bounciness(value: number) {
    if (!Number.isFinite(value)) {
      throw new RangeError("Bounciness must be finite.");
    }
    value = Math.min(1, Math.max(0, value));
    if (this._bounciness !== value) {
      this._bounciness = value;
      this._nativeMaterial.setBounciness(value);
    }
  }

  /**
   * The coefficient of dynamic friction, clamped to non-negative values.
   */
  get dynamicFriction(): number {
    return this._dynamicFriction;
  }

  set dynamicFriction(value: number) {
    if (!Number.isFinite(value)) {
      throw new RangeError("Dynamic friction must be finite.");
    }
    value = Math.max(0, value);
    if (this._dynamicFriction !== value) {
      this._dynamicFriction = value;
      this._nativeMaterial.setDynamicFriction(value);
    }
  }

  /**
   * The coefficient of static friction, clamped to non-negative values.
   */
  get staticFriction(): number {
    return this._staticFriction;
  }

  set staticFriction(value: number) {
    if (!Number.isFinite(value)) {
      throw new RangeError("Static friction must be finite.");
    }
    value = Math.max(0, value);
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
    if (
      !Number.isInteger(value) ||
      value < PhysicsMaterialCombineMode.Average ||
      value > PhysicsMaterialCombineMode.Maximum
    ) {
      throw new RangeError("Invalid bounce combine mode.");
    }
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
    if (
      !Number.isInteger(value) ||
      value < PhysicsMaterialCombineMode.Average ||
      value > PhysicsMaterialCombineMode.Maximum
    ) {
      throw new RangeError("Invalid friction combine mode.");
    }
    if (this._frictionCombine !== value) {
      this._frictionCombine = value;
      this._nativeMaterial.setFrictionCombine(value);
    }
  }

  /** @internal */
  override _addReferCount(value: number): void {
    if (this._nativeMaterial) {
      super._addReferCount(value);
    }
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._nativeMaterial?.destroy();
    this._nativeMaterial = null!;
  }
}
