import { PhysXPhysics } from "./PhysXPhysics";
import { IPhysicsMaterial } from "@oasis-engine/design";

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
export class PhysXPhysicsMaterial implements IPhysicsMaterial {
  /**
   * PhysX material object
   * @internal
   */
  _pxMaterial: any;

  constructor(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: PhysicsCombineMode,
    bounceCombine: PhysicsCombineMode
  ) {
    this._pxMaterial = PhysXPhysics.physics.createMaterial(staticFriction, dynamicFriction, bounciness);
    this._pxMaterial.setFrictionCombineMode(frictionCombine);
    this._pxMaterial.setRestitutionCombineMode(bounceCombine);
  }

  /** Sets the coefficient of restitution
   * @param value Coefficient of restitution.
   */
  setBounciness(value: number) {
    this._pxMaterial.setRestitution(value);
  }

  /** Sets the coefficient of dynamic friction.
   * @param value Coefficient of dynamic friction.
   */
  setDynamicFriction(value: number) {
    this._pxMaterial.setDynamicFriction(value);
  }

  /** Sets the coefficient of static friction
   * @param value Coefficient of static friction.
   */
  setStaticFriction(value: number) {
    this._pxMaterial.setStaticFriction(value);
  }

  /** Sets the restitution combine mode.
   * @param value Restitution combine mode for this material.
   */
  setBounceCombine(value: PhysicsCombineMode) {
    this._pxMaterial.setRestitutionCombineMode(value);
  }

  /** Sets the friction combine mode.
   * @param value Friction combine mode to set for this material.
   */
  setFrictionCombine(value: PhysicsCombineMode) {
    this._pxMaterial.setFrictionCombineMode(value);
  }
}
