import { IClone } from "@galacean/engine-design";
import { Color } from "@galacean/engine-math";
import { ColorSpace } from "../../enums/ColorSpace";
import { deepClone } from "../../clone/CloneManager";
import { ignoreClone } from "oasis-engine";

/**
 * Particle gradient.
 */
export class ParticleGradient implements IClone {
  @deepClone
  private _colorKeys: ColorKey[] = [];
  @deepClone
  private _alphaKeys: AlphaKey[] = [];
  @ignoreClone
  private _colorTypeArray: Float32Array;
  @ignoreClone
  private _alphaTypeArray: Float32Array;
  private _colorTypeArrayDirty: boolean = false;
  private _alphaTypeArrayDirty: boolean = false;

  /**
   * The color keys of the gradient.
   */
  get colorKeys(): ReadonlyArray<ColorKey> {
    return this._colorKeys;
  }

  /**
   * The alpha keys of the gradient.
   */
  get alphaKeys(): ReadonlyArray<AlphaKey> {
    return this._alphaKeys;
  }

  /**
   * Create a new particle gradient.
   * @param colorKeys - The color keys of the gradient
   * @param alphaKeys - The alpha keys of the gradient
   */
  constructor(colorKeys: ColorKey[] = null, alphaKeys: AlphaKey[] = null) {
    if (colorKeys) {
      for (let i = 0, n = colorKeys.length; i < n; i++) {
        const key = colorKeys[i];
        this.addColorKey(key);
      }
    }

    if (alphaKeys) {
      for (let i = 0, n = alphaKeys.length; i < n; i++) {
        const key = alphaKeys[i];
        this.addAlphaKey(key);
      }
    }
  }

  /**
   * Add a color key to the gradient.
   * @param key - The key
   */
  addColorKey(key: ColorKey): void;
  /**
   * Add a color key to the gradient.
   * @param time - The key time
   * @param color - The key color
   */
  addColorKey(time: number, color: Color): void;

  addColorKey(timeOrKey: number | ColorKey, color?: Color): void {
    const colorKeys = this._colorKeys;
    const length = colorKeys.length;

    if (length === 4) {
      throw new Error("Gradient can only have 4 color keys");
    }

    const key = typeof timeOrKey === "number" ? new ColorKey(timeOrKey, color) : timeOrKey;
    this._addKey(colorKeys, key);
  }

  /**
   * Add an alpha key to the gradient.
   * @param key - The key
   */
  addAlphaKey(key: AlphaKey): void;

  /**
   * Add an alpha key to the gradient.
   * @param time - The key time
   * @param alpha - The key alpha
   */
  addAlphaKey(time: number, alpha: number): void;

  addAlphaKey(timeOrKey: number | AlphaKey, alpha?: number): void {
    const alphaKeys = this._alphaKeys;
    const length = alphaKeys.length;

    if (length === 4) {
      throw new Error("Gradient can only have 4 color keys");
    }

    const key = typeof timeOrKey === "number" ? new AlphaKey(timeOrKey, alpha) : timeOrKey;
    this._addKey(alphaKeys, key);
  }

  /**
   * Remove a color key from the gradient.
   * @param index - The remove color key index
   */
  removeColorKey(index: number): void {
    this._removeKey(this._colorKeys, index);
  }

  /**
   * Remove an alpha key from the gradient.
   * @param index - The remove alpha key index
   */
  removeAlphaKey(index: number): void {
    this._removeKey(this._alphaKeys, index);
  }

  /**
   * @inheritDoc
   */
  cloneTo(dest: ParticleGradient): void {}

  /**
   * @inheritDoc
   */
  clone(): ParticleGradient {
    let destCurve = new ParticleGradient();
    this.cloneTo(destCurve);
    return destCurve;
  }

  /**
   * @internal
   */
  _getColorTypeArray(colorSpace: ColorSpace): Float32Array {
    const typeArray = (this._colorTypeArray ||= new Float32Array(4 * 4));
    if (this._colorTypeArrayDirty) {
      const keys = this._colorKeys;
      for (let i = 0, n = Math.min(keys.length, 4); i < n; i++) {
        const offset = i * 4;
        const key = keys[i];
        typeArray[offset] = key.time;
        const color = key.color;
        if (colorSpace === ColorSpace.Linear) {
          typeArray[offset + 1] = Color.gammaToLinearSpace(color.r);
          typeArray[offset + 2] = Color.gammaToLinearSpace(color.g);
          typeArray[offset + 3] = Color.gammaToLinearSpace(color.b);
        } else {
          typeArray[offset + 1] = color.r;
          typeArray[offset + 2] = color.g;
          typeArray[offset + 3] = color.b;
        }
      }
      this._colorTypeArrayDirty = false;
    }

    return typeArray;
  }

  /**
   * @internal
   */
  _getAlphaTypeArray(): Float32Array {
    const typeArray = (this._alphaTypeArray ||= new Float32Array(4 * 2));
    if (this._alphaTypeArrayDirty) {
      const keys = this._alphaKeys;
      for (let i = 0, n = Math.min(keys.length, 4); i < n; i++) {
        const offset = i * 2;
        const key = keys[i];
        typeArray[offset] = key.time;
        typeArray[offset + 1] = key.alpha;
      }
      this._alphaTypeArrayDirty = false;
    }

    return typeArray;
  }

  private _addKey<T extends { time: number }>(keys: T[], key: T): void {
    const time = key.time;
    const count = keys.length;
    const duration = count ? keys[count - 1].time : 0;
    if (time >= duration) {
      keys.push(key);
    } else {
      let index = count;
      while (--index >= 0 && time < keys[index].time);
      keys.splice(index + 1, 0, key);
    }
    this._colorTypeArrayDirty = true;
    this._alphaTypeArrayDirty = true;
  }

  private _removeKey<T extends { time: number }>(keys: T[], index: number): void {
    keys.splice(index, 1);
    this._colorTypeArrayDirty = true;
    this._alphaTypeArrayDirty = true;
  }
}

/**
 * The color key of the particle gradient.
 */
export class ColorKey {
  constructor(
    /** The key time. */
    public time: number,
    /** The key color. */
    public color: Color
  ) {}
}

/**
 * The alpha key of the particle gradient.
 */
export class AlphaKey {
  constructor(
    /** The key time. */
    public time: number,
    /** The key alpha. */
    public alpha: number
  ) {}
}
