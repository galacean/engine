import { IClone } from "@galacean/engine-design";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export class ParticleCurve implements IClone {
  private _currentLength: number = 0;
  /** @internal */
  _elements: Float32Array = new Float32Array(8);

  /** The number of keys in the curve.  */
  get gradientCount(): number {
    return this._currentLength / 2;
  }

  /**
   * Add a new key to the curve.
   * @param key - The time at which to add the key
   * @param value - The value for the key
   */
  add(key: number, value: number): void {
    if (this._currentLength < 8) {
      if (this._currentLength === 6 && key !== 1) {
        key = 1;
        console.log("The forth key is  be force set to 1.");
      }

      this._elements[this._currentLength++] = key;
      this._elements[this._currentLength++] = value;
    } else {
      throw "Data count must lessEqual than 4";
    }
  }

  /**
   * Get key of keyframe by using index
   * @param index - The index
   */
  getKeyByIndex(index: number): number {
    return this._elements[index * 2];
  }

  /**
   * Get value of keyframe by using index
   * @param index - The index
   */
  getValueByIndex(index: number): number {
    return this._elements[index * 2 + 1];
  }

  /**
   * Get average value
   */
  getAverageValue(): number {
    let total: number = 0;
    let count: number = 0;
    for (let i: number = 0, n: number = this._currentLength - 2; i < n; i += 2) {
      let subValue: number = this._elements[i + 1];
      subValue += this._elements[i + 3];
      subValue = subValue * (this._elements[i + 2] - this._elements[i]);
      total += subValue;
      count++;
    }
    return total / count;
  }

  /**
   * @override
   */
  cloneTo(destGradientDataNumber: ParticleCurve): void {
    destGradientDataNumber._currentLength = this._currentLength;
    const destElements: Float32Array = destGradientDataNumber._elements;
    for (let i: number = 0, n: number = this._elements.length; i < n; i++) destElements[i] = this._elements[i];
  }

  /**
   * @override
   */
  clone(): ParticleCurve {
    const destGradientDataNumber: ParticleCurve = new ParticleCurve();
    this.cloneTo(destGradientDataNumber);
    return destGradientDataNumber;
  }
}
