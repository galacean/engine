import type { ISpineBone } from "@galacean/engine-design";

/** A bone's local pose and evaluated world transform, owned by one skeleton instance. */
export class SpineBone {
  private constructor(private _native: ISpineBone) {}
  /** @internal */
  static _create(native: ISpineBone): SpineBone {
    return new SpineBone(native);
  }
  get name(): string {
    return this._native.data.name;
  }
  get x(): number {
    return this._native.x;
  }
  set x(value: number) {
    this._native.x = value;
  }
  get y(): number {
    return this._native.y;
  }
  set y(value: number) {
    this._native.y = value;
  }
  get rotation(): number {
    return this._native.rotation;
  }
  set rotation(value: number) {
    this._native.rotation = value;
  }
  get scaleX(): number {
    return this._native.scaleX;
  }
  set scaleX(value: number) {
    this._native.scaleX = value;
  }
  get scaleY(): number {
    return this._native.scaleY;
  }
  set scaleY(value: number) {
    this._native.scaleY = value;
  }
  get shearX(): number {
    return this._native.shearX;
  }
  set shearX(value: number) {
    this._native.shearX = value;
  }
  get shearY(): number {
    return this._native.shearY;
  }
  set shearY(value: number) {
    this._native.shearY = value;
  }

  get a(): number {
    return this._native.a;
  }
  get b(): number {
    return this._native.b;
  }
  get c(): number {
    return this._native.c;
  }
  get d(): number {
    return this._native.d;
  }
  get worldX(): number {
    return this._native.worldX;
  }
  get worldY(): number {
    return this._native.worldY;
  }

  isActive(): boolean {
    return this._native.isActive();
  }
  setToSetupPose(): void {
    this._native.setToSetupPose();
  }
}
