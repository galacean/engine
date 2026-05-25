import { IPhysicsMaterial } from "@galacean/engine-design";

/**
 * Physics material describes how to handle colliding objects (friction, bounciness).
 *
 * Physics-lite does not implement material effects; setters are no-ops (matching
 * the convention used by `LiteColliderShape.setMaterial/setContactOffset/setIsTrigger`).
 * This lets engine-side state changes (including clone `_syncNative` re-writes) flow
 * through without crashing while still leaving a one-time hint via console.log on
 * the first write so users notice the limitation.
 */
export class LitePhysicsMaterial implements IPhysicsMaterial {
  private static _warned = false;

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
    LitePhysicsMaterial._warnOnce();
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setDynamicFriction }
   */
  setDynamicFriction(value: number): void {
    LitePhysicsMaterial._warnOnce();
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setStaticFriction }
   */
  setStaticFriction(value: number): void {
    LitePhysicsMaterial._warnOnce();
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setBounceCombine }
   */
  setBounceCombine(value: number): void {
    LitePhysicsMaterial._warnOnce();
  }

  /**
   * {@inheritDoc IPhysicsMaterial.setFrictionCombine }
   */
  setFrictionCombine(value: number): void {
    LitePhysicsMaterial._warnOnce();
  }

  /**
   * {@inheritDoc IPhysicsMaterial.destroy }
   */
  destroy(): void {}

  private static _warnOnce(): void {
    if (LitePhysicsMaterial._warned) return;
    LitePhysicsMaterial._warned = true;
    console.log("Physics-lite don't support physics material. Use Physics-PhysX instead!");
  }
}
