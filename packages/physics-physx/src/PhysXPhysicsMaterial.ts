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
  /** @internal */
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

  /**
   * {@inheritDoc IPhysicsMaterial.setBounciness }
   */
  setBounciness(value: number) {
    this._pxMaterial.setRestitution(value);
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setDynamicFriction }
   */
  setDynamicFriction(value: number) {
    this._pxMaterial.setDynamicFriction(value);
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setStaticFriction }
   */
  setStaticFriction(value: number) {
    this._pxMaterial.setStaticFriction(value);
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setBounceCombine }
   */
  setBounceCombine(value: PhysicsCombineMode) {
    this._pxMaterial.setRestitutionCombineMode(value);
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setFrictionCombine }
   */
  setFrictionCombine(value: PhysicsCombineMode) {
    this._pxMaterial.setFrictionCombineMode(value);
  }
}
