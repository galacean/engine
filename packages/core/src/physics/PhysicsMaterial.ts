import { IPhysicsMaterial, IPhysicsMaterialProperties } from "@galacean/engine-design";
import { ReferResource } from "../asset/ReferResource";
import { Engine } from "../Engine";
import { PhysicsMaterialCombineMode } from "./enums/PhysicsMaterialCombineMode";

/**
 * Surface friction, bounciness, and combine modes for collider shapes.
 * @remarks Coefficients must be finite. Bounciness is clamped to [0, 1], and friction is clamped to non-negative values.
 */
export class PhysicsMaterial extends ReferResource<Engine | null> {
  /** @internal */
  static readonly _defaultProperties: IPhysicsMaterialProperties = Object.freeze({
    staticFriction: 0.6,
    dynamicFriction: 0.6,
    bounciness: 0,
    frictionCombine: PhysicsMaterialCombineMode.Average,
    bounceCombine: PhysicsMaterialCombineMode.Average
  });

  private _bounciness = PhysicsMaterial._defaultProperties.bounciness;
  private _dynamicFriction = PhysicsMaterial._defaultProperties.dynamicFriction;
  private _staticFriction = PhysicsMaterial._defaultProperties.staticFriction;
  private _bounceCombine: PhysicsMaterialCombineMode = PhysicsMaterial._defaultProperties.bounceCombine;
  private _frictionCombine: PhysicsMaterialCombineMode = PhysicsMaterial._defaultProperties.frictionCombine;
  /** @internal */
  _nativeMaterial: IPhysicsMaterial;

  /**
   * Create a physics material.
   * @param engine - Owner for resource caching and garbage collection. When omitted, the material can
   * be shared across engines using the same physics backend instance and is destroyed when its last reference is released.
   */
  constructor(engine?: Engine) {
    super(engine ?? null);
    try {
      this._nativeMaterial = Engine._nativePhysics.createPhysicsMaterial(PhysicsMaterial._defaultProperties);
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

  /**
   * Create an independent material with the same properties and engine owner.
   */
  clone(): PhysicsMaterial {
    const material = new PhysicsMaterial(this._engine ?? undefined);
    material.staticFriction = this._staticFriction;
    material.dynamicFriction = this._dynamicFriction;
    material.bounciness = this._bounciness;
    material.frictionCombine = this._frictionCombine;
    material.bounceCombine = this._bounceCombine;
    return material;
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
