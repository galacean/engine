import type { ISpineSkeletonData, ISpineSkin } from "@galacean/engine-design";
import type { SpineAnimation } from "./SpineAnimation";
import { SpineSkin } from "./SpineSkin";

/** Shared asset metadata, animations and skins. Instances retain the same data object. */
export class SpineSkeletonData {
  /** @internal */
  readonly _native: ISpineSkeletonData;
  private _skins = new WeakMap<ISpineSkin, SpineSkin>();
  readonly animations: readonly SpineAnimation[];
  readonly skins: readonly SpineSkin[];

  private constructor(native: ISpineSkeletonData) {
    this._native = native;
    this.animations = Object.freeze(native.animations.map(({ name, duration }) => Object.freeze({ name, duration })));
    this.skins = Object.freeze(native.skins.map((skin) => this._wrapSkin(skin)));
  }

  /** @internal */
  static _create(native: ISpineSkeletonData): SpineSkeletonData {
    return new SpineSkeletonData(native);
  }

  get name(): string | null {
    return this._native.name ?? null;
  }
  get version(): string | null {
    return this._native.version ?? null;
  }
  get x(): number {
    return this._native.x;
  }
  get y(): number {
    return this._native.y;
  }
  get width(): number {
    return this._native.width;
  }
  get height(): number {
    return this._native.height;
  }
  get defaultSkin(): SpineSkin | null {
    return this._wrapSkin(this._native.defaultSkin);
  }

  findSkin(name: string): SpineSkin | null {
    return this._wrapSkin(this._native.findSkin(name));
  }
  findAnimation(name: string): SpineAnimation | null {
    return this.animations.find((animation) => animation.name === name) ?? null;
  }

  /** @internal */
  _wrapSkin(native: ISpineSkin | null | undefined): SpineSkin | null {
    if (!native) return null;
    let skin = this._skins.get(native);
    if (!skin) {
      skin = SpineSkin._create(native, this);
      this._skins.set(native, skin);
    }
    return skin;
  }
}
