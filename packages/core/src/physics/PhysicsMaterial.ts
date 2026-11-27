import { IPhysicsMaterial, IPhysicsMaterialProperties, PhysicsMaterialCombineMode } from "@galacean/engine-design";
import { ReferResource } from "../asset/ReferResource";
import { Engine } from "../Engine";

/**
 * Surface friction, bounciness, and combine modes for colliders.
 */
export class PhysicsMaterial extends ReferResource {
  /** @internal */
  static readonly _defaultProperties: IPhysicsMaterialProperties = {
    staticFriction: 0.6,
    dynamicFriction: 0.6,
    bounciness: 0,
    frictionCombine: PhysicsMaterialCombineMode.Average,
    bounceCombine: PhysicsMaterialCombineMode.Average
  };

  /** @internal */
  _nativeMaterial: IPhysicsMaterial;

  private _bounciness = PhysicsMaterial._defaultProperties.bounciness;
  private _dynamicFriction = PhysicsMaterial._defaultProperties.dynamicFriction;
  private _staticFriction = PhysicsMaterial._defaultProperties.staticFriction;
  private _bounceCombine: PhysicsMaterialCombineMode = PhysicsMaterial._defaultProperties.bounceCombine;
  private _frictionCombine: PhysicsMaterialCombineMode = PhysicsMaterial._defaultProperties.frictionCombine;

  /**
   * The coefficient of bounciness. Must be between 0 and 1.
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
   * The coefficient of dynamic friction.
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
   * Create a physics material.
   * @param engine - Engine to which the physics material belongs
   * @throws When `engine` is invalid or physics is not initialized on it.
   */
  constructor(engine: Engine) {
    if (!(engine instanceof Engine)) {
      throw new Error("PhysicsMaterial requires an owning Engine.");
    }
    if (!engine._physicsInitialized) {
      throw new Error("Physics is not initialized on this Engine.");
    }
    const nativeMaterial = Engine._nativePhysics.createPhysicsMaterial(PhysicsMaterial._defaultProperties);
    super(engine);
    this._nativeMaterial = nativeMaterial;
  }

  /**
   * Create an independent material with the same properties, owned by the same engine.
   */
  clone(): PhysicsMaterial {
    const material = new PhysicsMaterial(this._engine);
    material.staticFriction = this._staticFriction;
    material.dynamicFriction = this._dynamicFriction;
    material.bounciness = this._bounciness;
    material.frictionCombine = this._frictionCombine;
    material.bounceCombine = this._bounceCombine;
    return material;
  }

  /**
   * @internal
   */
  override _addReferCount(value: number): void {
    // Allow _onDestroy() to clear the reference count while the native material still exists.
    // Colliders may release their references after the native material has been destroyed.
    this._nativeMaterial && super._addReferCount(value);
  }

  protected override _onDestroy(): void {
    super._onDestroy();
    this._nativeMaterial.destroy();
    this._nativeMaterial = null!;
  }
}
