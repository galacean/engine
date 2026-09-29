import { IPhysicsMaterial, IPhysicsMaterialProperties } from "@galacean/engine-design";
import { PhysXPhysics } from "./PhysXPhysics";

/**
 * Physics material describes how to handle colliding objects (friction, bounciness).
 */
export class PhysXPhysicsMaterial implements IPhysicsMaterial {
  /** @internal */
  _pxMaterial: any;

  constructor(physXPhysics: PhysXPhysics, properties: IPhysicsMaterialProperties) {
    const { staticFriction, dynamicFriction, bounciness, frictionCombine, bounceCombine } = properties;
    const pxMaterial = physXPhysics._pxPhysics.createMaterial(staticFriction, dynamicFriction, bounciness);
    pxMaterial.setFrictionCombineMode(frictionCombine);
    pxMaterial.setRestitutionCombineMode(bounceCombine);
    this._pxMaterial = pxMaterial;
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
  setBounceCombine(value: number) {
    this._pxMaterial.setRestitutionCombineMode(value);
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setFrictionCombine }
   */
  setFrictionCombine(value: number) {
    this._pxMaterial.setFrictionCombineMode(value);
  }

  /**
   * {@inheritDoc IPhysicsMaterial.destroy }
   */
  destroy(): void {
    this._pxMaterial.release();
  }
}
