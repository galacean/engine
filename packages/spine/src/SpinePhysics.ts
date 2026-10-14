import type { ISpinePhysics, SpineCapability } from "@galacean/engine-design";
import { SpinePhysicsConstraint } from "./SpinePhysicsConstraint";

/** Physics availability for the bound asset. Narrow supported before accessing value. */
export type SpinePhysicsSupport =
  | { readonly supported: true; readonly value: SpinePhysics }
  | { readonly supported: false; readonly reason: string };

/** Physics controls evaluated by the skeleton's backend. */
export class SpinePhysics {
  readonly physicsConstraints: readonly SpinePhysicsConstraint[];
  private constructor(private _native: ISpinePhysics) {
    this.physicsConstraints = Object.freeze(_native.physicsConstraints.map((c) => SpinePhysicsConstraint._create(c)));
  }
  /** @internal */
  static _create(capability: SpineCapability<ISpinePhysics>): SpinePhysicsSupport {
    return capability.supported === true
      ? Object.freeze({ supported: true, value: new SpinePhysics(capability.value) })
      : Object.freeze({ supported: false, reason: capability.reason });
  }
  physicsTranslate(x: number, y: number): void {
    this._native.physicsTranslate(x, y);
  }
  physicsRotate(x: number, y: number, degrees: number): void {
    this._native.physicsRotate(x, y, degrees);
  }
}
