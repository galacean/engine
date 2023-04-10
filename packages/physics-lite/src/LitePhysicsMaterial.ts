import { IPhysicsMaterial } from "@galacean/engine-design";

/**
 * Physics material describes how to handle colliding objects (friction, bounciness).
 */
export class LitePhysicsMaterial implements IPhysicsMaterial {
  constructor(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ) {}

  /**
   * {@inheritDoc IPhysicsMaterial.setBounciness }
   */
  setBounciness(value: number): void {
    throw "Physics-lite don't support physics material. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setDynamicFriction }
   */
  setDynamicFriction(value: number): void {
    throw "Physics-lite don't support physics material. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setStaticFriction }
   */
  setStaticFriction(value: number): void {
    throw "Physics-lite don't support physics material. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setBounceCombine }
   */
  setBounceCombine(value: number): void {
    throw "Physics-lite don't support physics material. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setFrictionCombine }
   */
  setFrictionCombine(value: number): void {
    throw "Physics-lite don't support physics material. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysicsMaterial.destroy }
   */
  destroy(): void {}
}
