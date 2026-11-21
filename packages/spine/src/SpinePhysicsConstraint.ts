import type { ISpinePhysicsConstraint } from "@galacean/engine-design";

/** An instance's physics constraint. Changes affect only this skeleton. */
export class SpinePhysicsConstraint {
  private constructor(private _native: ISpinePhysicsConstraint) {}
  /** @internal */
  static _create(native: ISpinePhysicsConstraint): SpinePhysicsConstraint {
    return new SpinePhysicsConstraint(native);
  }
  get name(): string {
    return this._native.data.name;
  }
  get inertia(): number {
    return this._native.inertia;
  }
  set inertia(value: number) {
    this._native.inertia = value;
  }
  get strength(): number {
    return this._native.strength;
  }
  set strength(value: number) {
    this._native.strength = value;
  }
  get damping(): number {
    return this._native.damping;
  }
  set damping(value: number) {
    this._native.damping = value;
  }
  get massInverse(): number {
    return this._native.massInverse;
  }
  set massInverse(value: number) {
    this._native.massInverse = value;
  }
  get wind(): number {
    return this._native.wind;
  }
  set wind(value: number) {
    this._native.wind = value;
  }
  get gravity(): number {
    return this._native.gravity;
  }
  set gravity(value: number) {
    this._native.gravity = value;
  }
  get mix(): number {
    return this._native.mix;
  }
  set mix(value: number) {
    this._native.mix = value;
  }

  isActive(): boolean {
    return this._native.isActive();
  }
  reset(): void {
    this._native.reset();
  }
}
