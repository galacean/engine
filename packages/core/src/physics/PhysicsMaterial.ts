import { IPhysicsMaterial } from "@oasis-engine/design";
import { Engine } from "../Engine";

export class PhysicsMaterial {
  /** @internal */
  _physicsMaterial: IPhysicsMaterial;

  constructor(mat: IPhysicsMaterial);

  constructor(engine: Engine, staticFriction: number, dynamicFriction: number, bounciness: number);

  constructor(
    engineOrMat: Engine | IPhysicsMaterial,
    staticFriction?: number,
    dynamicFriction?: number,
    bounciness?: number
  ) {
    if (typeof staticFriction === "number") {
      this._physicsMaterial = (<Engine>engineOrMat)._physicsEngine.createPhysicsMaterial(
        staticFriction,
        dynamicFriction,
        bounciness
      );
    } else {
      this._physicsMaterial = <IPhysicsMaterial>engineOrMat;
    }
  }

  /** Retrieves the coefficient of restitution. */
  get bounciness(): number {
    return this._physicsMaterial.bounciness;
  }

  /** Sets the coefficient of restitution
   * @param value Coefficient of restitution.
   */
  set bounciness(value: number) {
    this._physicsMaterial.bounciness = value;
  }

  /** Retrieves the DynamicFriction value. */
  get dynamicFriction(): number {
    return this._physicsMaterial.dynamicFriction;
  }

  /** Sets the coefficient of dynamic friction.
   * @param value Coefficient of dynamic friction.
   */
  set dynamicFriction(value: number) {
    this._physicsMaterial.dynamicFriction = value;
  }

  /** Retrieves the coefficient of static friction. */
  get staticFriction(): number {
    return this._physicsMaterial.staticFriction;
  }

  /** Sets the coefficient of static friction
   * @param value Coefficient of static friction.
   */
  set staticFriction(value: number) {
    this._physicsMaterial.staticFriction = value;
  }

  /** Retrieves the restitution combine mode. */
  get bounceCombine(): number {
    return this._physicsMaterial.bounceCombine;
  }

  /** Sets the restitution combine mode.
   * @param value Restitution combine mode for this material.
   */
  set bounceCombine(value: number) {
    this._physicsMaterial.bounceCombine = value;
  }

  /** Retrieves the friction combine mode. */
  get frictionCombine(): number {
    return this._physicsMaterial.frictionCombine;
  }

  /** Sets the friction combine mode.
   * @param value Friction combine mode to set for this material.
   */
  set frictionCombine(value: number) {
    this._physicsMaterial.frictionCombine = value;
  }
}
