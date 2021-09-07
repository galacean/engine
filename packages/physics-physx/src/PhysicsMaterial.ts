import { PhysXManager } from "./PhysXManager";

/**
 * Describes how physics materials of the colliding objects are combined.
 */
export enum PhysicsCombineMode {
  /** Averages the friction/bounce of the two colliding materials. */
  Average,
  /** Uses the smaller friction/bounce of the two colliding materials. */
  Minimum,
  /** Multiplies the friction/bounce of the two colliding materials. */
  Multiply,
  /** Uses the larger friction/bounce of the two colliding materials. */
  Maximum
}

/**
 * Physics material describes how to handle colliding objects (friction, bounciness).
 */
export class PhysicsMaterial {
  private _bounciness: number;
  private _dynamicFriction: number;
  private _staticFriction: number;

  private _bounceCombine: PhysicsCombineMode = PhysicsCombineMode.Average;
  private _frictionCombine: PhysicsCombineMode = PhysicsCombineMode.Average;

  /**
   * PhysX material object
   * @internal
   */
  _pxMaterial: any;

  constructor(staticFriction: number, dynamicFriction: number, bounciness: number) {
    this._staticFriction = staticFriction;
    this._dynamicFriction = dynamicFriction;
    this._bounciness = bounciness;

    // alloc PhysX object
    this._alloc();
  }

  /** Retrieves the coefficient of restitution. */
  get bounciness(): number {
    return this._bounciness;
  }

  /** Sets the coefficient of restitution
   * @param value Coefficient of restitution.
   */
  set bounciness(value: number) {
    this._bounciness = value;
    this._pxMaterial.setRestitution(this._bounciness);
  }

  /** Retrieves the DynamicFriction value. */
  get dynamicFriction(): number {
    return this._dynamicFriction;
  }

  /** Sets the coefficient of dynamic friction.
   * @param value Coefficient of dynamic friction.
   */
  set dynamicFriction(value: number) {
    this._dynamicFriction = value;
    this._pxMaterial.setDynamicFriction(this._dynamicFriction);
  }

  /** Retrieves the coefficient of static friction. */
  get staticFriction(): number {
    return this._staticFriction;
  }

  /** Sets the coefficient of static friction
   * @param value Coefficient of static friction.
   */
  set staticFriction(value: number) {
    this._staticFriction = value;
    this._pxMaterial.setStaticFriction(this._staticFriction);
  }

  /** Retrieves the restitution combine mode. */
  get bounceCombine(): PhysicsCombineMode {
    return this._bounceCombine;
  }

  /** Sets the restitution combine mode.
   * @param value Restitution combine mode for this material.
   */
  set bounceCombine(value: PhysicsCombineMode) {
    this._bounceCombine = value;
    this._pxMaterial.setRestitutionCombineMode(this._bounceCombine);
  }

  /** Retrieves the friction combine mode. */
  get frictionCombine(): PhysicsCombineMode {
    return this._frictionCombine;
  }

  /** Sets the friction combine mode.
   * @param value Friction combine mode to set for this material.
   */
  set frictionCombine(value: PhysicsCombineMode) {
    this._frictionCombine = value;
    this._pxMaterial.setFrictionCombineMode(this._frictionCombine);
  }

  /** alloc PhysX PhysicalMaterial object */
  private _alloc() {
    this._pxMaterial = PhysXManager.physics.createMaterial(
      this._staticFriction,
      this._dynamicFriction,
      this._bounciness
    );
    this._pxMaterial.setFrictionCombineMode(this._frictionCombine);
    this._pxMaterial.setRestitutionCombineMode(this._bounceCombine);
  }
}
