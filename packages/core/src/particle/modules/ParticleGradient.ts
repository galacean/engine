import { Color } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ColorSpace } from "../../enums/ColorSpace";

/**
 * Particle gradient.
 */
export class ParticleGradient {
  @deepClone
  private _colorKeys: GradientColorKey[] = [];
  @deepClone
  private _alphaKeys: GradientAlphaKey[] = [];
  @ignoreClone
  private _colorTypeArray: Float32Array;
  @ignoreClone
  private _alphaTypeArray: Float32Array;

  private _colorTypeArrayDirty: boolean = false;
  private _alphaTypeArrayDirty: boolean = false;

  /**
   * The color keys of the gradient.
   */
  get colorKeys(): ReadonlyArray<GradientColorKey> {
    return this._colorKeys;
  }

  /**
   * The alpha keys of the gradient.
   */
  get alphaKeys(): ReadonlyArray<GradientAlphaKey> {
    return this._alphaKeys;
  }

  /**
   * Create a new particle gradient.
   * @param colorKeys - The color keys of the gradient
   * @param alphaKeys - The alpha keys of the gradient
   */
  constructor(colorKeys: GradientColorKey[] = null, alphaKeys: GradientAlphaKey[] = null) {
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
  addColorKey(key: GradientColorKey): void;
  /**
   * Add a color key to the gradient.
   * @param time - The key time
   * @param color - The key color
   */
  addColorKey(time: number, color: Color): void;

  addColorKey(timeOrKey: number | GradientColorKey, color?: Color): void {
    const colorKeys = this._colorKeys;

    if (colorKeys.length === 4) {
      throw new Error("Gradient can only have 4 color keys");
    }

    const key = typeof timeOrKey === "number" ? new GradientColorKey(timeOrKey, color) : timeOrKey;
    key._onValueChanged = this._setColorTypeArrayDirty.bind(this);
    this._addKey(colorKeys, key);
    this._colorTypeArrayDirty = true;
  }

  /**
   * Add an alpha key to the gradient.
   * @param key - The key
   */
  addAlphaKey(key: GradientAlphaKey): void;

  /**
   * Add an alpha key to the gradient.
   * @param time - The key time
   * @param alpha - The key alpha
   */
  addAlphaKey(time: number, alpha: number): void;

  addAlphaKey(timeOrKey: number | GradientAlphaKey, alpha?: number): void {
    const alphaKeys = this._alphaKeys;

    if (alphaKeys.length === 4) {
      throw new Error("Gradient can only have 4 color keys");
    }

    const key = typeof timeOrKey === "number" ? new GradientAlphaKey(timeOrKey, alpha) : timeOrKey;
    key._onValueChanged = this._setAlphaTypeArrayDirty.bind(this);
    this._addKey(alphaKeys, key);
    this._alphaTypeArrayDirty = true;
  }

  /**
   * Remove a color key from the gradient.
   * @param index - The remove color key index
   */
  removeColorKey(index: number): void {
    this._colorKeys[index]._onValueChanged = null;
    this._removeKey(this._colorKeys, index);
    this._colorTypeArrayDirty = true;
  }

  /**
   * Remove an alpha key from the gradient.
   * @param index - The remove alpha key index
   */
  removeAlphaKey(index: number): void {
    this._alphaKeys[index]._onValueChanged = null;
    this._removeKey(this._alphaKeys, index);
    this._alphaTypeArrayDirty = true;
  }

  /**
   * Set the keys of the gradient.
   * @param colorKeys - The color keys
   * @param alphaKeys - The alpha keys
   */
  setKeys(colorKeys: GradientColorKey[], alphaKeys: GradientAlphaKey[]): void {
    const currentColorKeys = this._colorKeys;
    const currentAlphaKeys = this._alphaKeys;
    for (let i = 0, n = currentColorKeys.length; i < n; i++) {
      currentColorKeys[i]._onValueChanged = null;
    }
    for (let i = 0, n = currentAlphaKeys.length; i < n; i++) {
      currentAlphaKeys[i]._onValueChanged = null;
    }
    currentColorKeys.length = 0;
    currentAlphaKeys.length = 0;
    for (let i = 0, n = colorKeys.length; i < n; i++) {
      this._addKey(currentColorKeys, colorKeys[i]);
    }
    for (let i = 0, n = alphaKeys.length; i < n; i++) {
      this._addKey(currentAlphaKeys, alphaKeys[i]);
    }
    this._alphaTypeArrayDirty = true;
    this._colorTypeArrayDirty = true;
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
  }

  private _removeKey<T extends { time: number }>(keys: T[], index: number): void {
    keys.splice(index, 1);
  }

  private _setColorTypeArrayDirty(): void {
    this._colorTypeArrayDirty = true;
  }

  private _setAlphaTypeArrayDirty(): void {
    this._alphaTypeArrayDirty = true;
  }
}

/**
 * The color key of the particle gradient.
 */
export class GradientColorKey {
  /** @internal */
  _onValueChanged: () => void = null;

  private _time: number;
  private _color: Color = new Color();

  /**
   * Constructor of GradientColorKey.
   * @param time - The time of the gradient colorKey
   * @param color - The alpha component of the gradient colorKey
   */
  constructor(time: number, color: Color) {
    this._time = time;
    color && this._color.copyFrom(color);
    // @ts-ignore
    this._color._onValueChanged = this._onValueChanged;
  }

  /**
   * The key time.
   */
  get time(): number {
    return this._time;
  }

  set time(value: number) {
    this._time = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The key color.
   */
  get color(): Color {
    return this._color;
  }

  set color(value: Color) {
    if (this._color !== value) {
      this._color.copyFrom(value);
    }
  }
}

/**
 * The alpha key of the particle gradient.
 */
export class GradientAlphaKey {
  /** @internal */
  _onValueChanged: () => void = null;

  private _time: number;
  private _alpha: number;

  /**
   * Constructor of GradientAlphaKey.
   * @param time - The time of the gradient alpha key
   * @param alpha - The alpha component of the gradient alpha key
   */
  constructor(time: number, alpha: number) {
    this._time = time;
    this._alpha = alpha;
  }

  /**
   * The key time.
   */
  get time(): number {
    return this._time;
  }

  set time(value: number) {
    this._time = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The key alpha.
   */
  get alpha(): number {
    return this._alpha;
  }

  set alpha(value: number) {
    this._alpha = value;
    this._onValueChanged && this._onValueChanged();
  }
}
