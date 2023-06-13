import { GradientMode } from "./enums/GradientMode";
import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { Vector4 } from "./Vector4";
import { Color } from "./Color";

/**
 * Gradient used for animating colors.
 */
export class Gradient implements IClone<Gradient>, ICopy<Gradient, Gradient> {
  private _mode: GradientMode = GradientMode.Blend;
  private readonly _maxColorRGBKeysCount: number = 0;
  private readonly _maxColorAlphaKeysCount: number = 0;
  private _colorRGBKeysCount: number = 0;
  private _colorAlphaKeysCount: number = 0;

  /**
   * element key range
   * x: colorKey min
   * y: colorKey max
   * z: alphaKey min
   * w: alphaKey max
   */
  keyRanges: Vector4 = new Vector4(1, 0, 1, 0);
  /** All alpha keys defined in the gradient. */
  alphaElements: Float32Array = null;
  /** All color keys defined in the gradient. */
  rgbElements: Float32Array = null;

  /**
   * Control how the gradient is evaluated.
   */
  get mode(): GradientMode {
    return this._mode;
  }

  set mode(value: GradientMode) {
    this._mode = value;
  }

  /**
   * Get RGB keys count.
   */
  get colorRGBKeysCount(): number {
    return this._colorRGBKeysCount;
  }

  /**
   * Get Alpha keys count
   */
  get colorAlphaKeysCount(): number {
    return this._colorAlphaKeysCount;
  }

  /**
   * Get max RGB keys count
   */
  get maxColorRGBKeysCount(): number {
    return this._maxColorRGBKeysCount;
  }

  /**
   * Get max alpha keys count
   */
  get maxColorAlphaKeysCount(): number {
    return this._maxColorAlphaKeysCount;
  }

  /**
   * @param maxColorRGBKeyCount - The max rgb key count
   * @param maxColorAlphaKeyCount - Thw max alpha key count
   */
  constructor(maxColorRGBKeyCount: number, maxColorAlphaKeyCount: number) {
    this._maxColorRGBKeysCount = maxColorRGBKeyCount;
    this._maxColorAlphaKeysCount = maxColorAlphaKeyCount;
    this.rgbElements = new Float32Array(maxColorRGBKeyCount * 4);
    this.alphaElements = new Float32Array(maxColorAlphaKeyCount * 2);
  }

  /**
   * Add rgb keyframe.
   * @param key - The lifetime from 0 to 1
   * @param value - The rgb value
   */
  addColorRGB(key: number, value: Color): void {
    if (this._colorRGBKeysCount < this._maxColorRGBKeysCount) {
      const offset: number = this._colorRGBKeysCount * 4;
      this.rgbElements[offset] = key;
      this.rgbElements[offset + 1] = value.r;
      this.rgbElements[offset + 2] = value.g;
      this.rgbElements[offset + 3] = value.b;
      this._colorRGBKeysCount++;
    } else {
      console.warn("Gradient:warning:data count must lessEqual than " + this._maxColorRGBKeysCount);
    }
  }

  /**
   * Add alpha keyframe
   * @param key - The lifetime from 0 to 1
   * @param value - The alpha value
   */
  addColorAlpha(key: number, value: number): void {
    if (this._colorAlphaKeysCount < this._maxColorAlphaKeysCount) {
      const offset: number = this._colorAlphaKeysCount * 2;
      this.alphaElements[offset] = key;
      this.alphaElements[offset + 1] = value;
      this._colorAlphaKeysCount++;
    } else {
      console.warn("Gradient:warning:data count must lessEqual than " + this._maxColorAlphaKeysCount);
    }
  }

  /**
   * Update rgb keyframe
   * @param index - The index
   * @param key - The lifetime from 0 to 1
   * @param value - The alpha value
   */
  updateColorRGB(index: number, key: number, value: Color): void {
    if (index < this._colorRGBKeysCount) {
      const offset: number = index * 4;
      this.rgbElements[offset] = key;
      this.rgbElements[offset + 1] = value.r;
      this.rgbElements[offset + 2] = value.g;
      this.rgbElements[offset + 3] = value.b;
    } else {
      console.warn("Gradient:warning:index must lessEqual than colorRGBKeysCount:" + this._colorRGBKeysCount);
    }
  }

  /**
   * Update alpha keyframe
   * @param index - The index
   * @param key - The lifetime from 0 to 1
   * @param value - The alpha value
   */
  updateColorAlpha(index: number, key: number, value: number): void {
    if (index < this._colorAlphaKeysCount) {
      const offset: number = index * 2;
      this.alphaElements[offset] = key;
      this.alphaElements[offset + 1] = value;
    } else {
      console.warn("Gradient:warning:index must lessEqual than colorAlphaKeysCount:" + this._colorAlphaKeysCount);
    }
  }

  /**
   * interpolate the keyframe to get rgb value
   * @param  lerpFactor - The ratio
   * @param  out - The result
   * @param  startSearchIndex - The start search index
   * @param reverseSearch - Whether reverse search
   */
  evaluateColorRGB(
    lerpFactor: number,
    out: Color,
    startSearchIndex: number = 0,
    reverseSearch: boolean = false
  ): number {
    lerpFactor = Math.min(Math.max(lerpFactor, 0.0), 1.0);

    const rgbElements: Float32Array = this.rgbElements;
    let curIndex: number = startSearchIndex;

    let offset: number;
    if (reverseSearch) {
      for (let i: number = curIndex; i >= 0; i--) {
        offset = i * 4;
        const left: number = rgbElements[offset];
        if (lerpFactor === left) {
          out.r = rgbElements[offset + 1];
          out.g = rgbElements[offset + 2];
          out.b = rgbElements[offset + 3];
          return curIndex;
        }

        switch (this._mode) {
          case GradientMode.Blend:
            if (lerpFactor > left) {
              const right: number = rgbElements[offset + 4];
              if (lerpFactor > right) throw "Gradient:wrong startSearchIndex.";
              const diff: number = right - left;
              const y1: number = right - lerpFactor;
              const y2: number = lerpFactor - left;
              out.r = (y1 * rgbElements[offset + 1] + y2 * rgbElements[offset + 5]) / diff;
              out.g = (y1 * rgbElements[offset + 2] + y2 * rgbElements[offset + 6]) / diff;
              out.b = (y1 * rgbElements[offset + 3] + y2 * rgbElements[offset + 7]) / diff;
              return curIndex;
            } else {
              curIndex--;
              continue;
            }
          case GradientMode.Fixed:
            if (lerpFactor > left) {
              if (lerpFactor > rgbElements[offset + 4]) throw "Gradient:wrong startSearchIndex.";
              out.r = rgbElements[offset + 5];
              out.g = rgbElements[offset + 6];
              out.b = rgbElements[offset + 7];
              return curIndex;
            } else {
              curIndex--;
              continue;
            }
          default:
            throw "Gradient:unknown mode.";
        }
      }
    } else {
      for (let i: number = 0, n: number = this.rgbElements.length; i < n; i++) {
        offset = i * 4;
        const right: number = rgbElements[offset];
        if (lerpFactor === right) {
          out.r = rgbElements[offset + 1];
          out.g = rgbElements[offset + 2];
          out.b = rgbElements[offset + 3];
          return curIndex;
        }

        switch (this._mode) {
          case GradientMode.Blend:
            if (lerpFactor < right) {
              const left: number = rgbElements[offset - 4];
              if (lerpFactor < left) throw "Gradient:wrong startSearchIndex.";
              const diff: number = right - left;
              const y1: number = right - lerpFactor;
              const y2: number = lerpFactor - left;
              out.r = (y1 * rgbElements[offset - 3] + y2 * rgbElements[offset + 1]) / diff;
              out.g = (y1 * rgbElements[offset - 2] + y2 * rgbElements[offset + 2]) / diff;
              out.b = (y1 * rgbElements[offset - 1] + y2 * rgbElements[offset + 3]) / diff;
              return curIndex;
            } else {
              curIndex++;
              continue;
            }
          case GradientMode.Fixed:
            if (lerpFactor < right) {
              if (lerpFactor < rgbElements[offset - 4]) throw "Gradient:wrong startSearchIndex.";
              out.r = rgbElements[offset + 1];
              out.g = rgbElements[offset + 2];
              out.b = rgbElements[offset + 3];
              return curIndex;
            } else {
              curIndex++;
              continue;
            }
          default:
            throw "Gradient:unknown mode.";
        }
      }
    }

    return curIndex;
  }

  /**
   * interpolate the keyframe to get alpha value
   * @param  lerpFactor - The ratio
   * @param  outColor - The result
   * @param  startSearchIndex - The start search index
   * @param reverseSearch - Whether reverse search
   */
  evaluateColorAlpha(
    lerpFactor: number,
    outColor: Color,
    startSearchIndex: number = 0,
    reverseSearch: boolean = false
  ): number {
    lerpFactor = Math.min(Math.max(lerpFactor, 0.0), 1.0);
    const alphaElements: Float32Array = this.alphaElements;
    let curIndex: number = startSearchIndex;

    if (reverseSearch) {
      for (let i: number = curIndex; i >= 0; i--) {
        const offset: number = i * 2;
        const left: number = alphaElements[offset];
        if (lerpFactor === left) {
          outColor.a = alphaElements[offset + 1];
          return curIndex;
        }

        switch (this._mode) {
          case GradientMode.Blend:
            if (lerpFactor > left) {
              const right: number = alphaElements[offset + 2];
              if (lerpFactor > right) throw "Gradient:wrong startSearchIndex.";

              const diff: number = right - left;
              const x1: number = right - lerpFactor;
              const x2: number = lerpFactor - left;
              outColor.a = (x1 * alphaElements[offset + 1] + x2 * alphaElements[offset + 3]) / diff;
              return curIndex;
            } else {
              curIndex--;
              continue;
            }
          case GradientMode.Fixed:
            if (lerpFactor > left) {
              if (lerpFactor > alphaElements[offset + 2]) throw "Gradient:wrong startSearchIndex.";
              outColor.a = alphaElements[offset + 3];
              return curIndex;
            } else {
              curIndex--;
              continue;
            }
          default:
            throw "Gradient:unknown mode.";
        }
      }
    } else {
      for (let i: number = curIndex, n: number = this.alphaElements.length; i < n; i++) {
        const offset: number = i * 2;
        const right: number = alphaElements[offset];
        if (lerpFactor === right) {
          outColor.a = alphaElements[offset + 1];
          return curIndex;
        }

        switch (this._mode) {
          case GradientMode.Blend:
            if (lerpFactor < right) {
              const left: number = alphaElements[offset - 2];
              if (lerpFactor < left) throw "Gradient:wrong startSearchIndex.";
              const diff: number = right - left;
              const x1: number = right - lerpFactor;
              const x2: number = lerpFactor - left;
              outColor.a = (x1 * alphaElements[offset - 1] + x2 * alphaElements[offset + 1]) / diff;
              return curIndex;
            } else {
              curIndex++;
              continue;
            }
          case GradientMode.Fixed:
            if (lerpFactor < right) {
              if (lerpFactor < alphaElements[offset - 2]) throw "Gradient:wrong startSearchIndex.";
              outColor.a = alphaElements[offset + 1];
              return curIndex;
            } else {
              curIndex++;
              continue;
            }
          default:
            throw "Gradient:unknown mode.";
        }
      }
    }

    return curIndex;
  }

  /**
   * @override
   */
  copyFrom(source: Gradient): Gradient {
    let i: number, n: number;
    this._colorAlphaKeysCount = source._colorAlphaKeysCount;
    const destAlphaElements: Float32Array = this.alphaElements;
    for (i = 0, n = this.alphaElements.length; i < n; i++) destAlphaElements[i] = source.alphaElements[i];

    this._colorRGBKeysCount = source._colorRGBKeysCount;
    const destRGBElements: Float32Array = this.rgbElements;
    for (i = 0, n = this.rgbElements.length; i < n; i++) destRGBElements[i] = source.rgbElements[i];

    return this;
  }

  /**
   * @override
   */
  clone(): Gradient {
    const destGradientDataColor: Gradient = new Gradient(this._maxColorRGBKeysCount, this._maxColorAlphaKeysCount);
    return destGradientDataColor.copyFrom(this);
  }
}
