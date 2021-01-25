import { ShaderMacro } from "./ShaderMacro";

/**
 * Shader macro collection.
 * @internal
 */
export class ShaderMacroCollection {
  /**
   * Union of two macro collection.
   * @param left - input macro collection
   * @param right - input macro collection
   * @param out - union output macro collection
   */
  static unionCollection(left: ShaderMacroCollection, right: ShaderMacroCollection, out: ShaderMacroCollection): void {
    const outMask = out._mask;
    let minSize: number, maxSize: number;
    let minMask: number[], maxMask: number[];
    if (left._length < right._length) {
      minSize = left._length;
      maxSize = right._length;
      minMask = left._mask;
      maxMask = right._mask;
    } else {
      minSize = right._length;
      maxSize = left._length;
      minMask = right._mask;
      maxMask = left._mask;
    }

    let i = 0;
    outMask.length < maxSize && (outMask.length = maxSize);
    for (; i < minSize; i++) {
      outMask[i] = minMask[i] | maxMask[i];
    }
    for (; i < maxSize; i++) {
      outMask[i] = maxMask[i];
    }
    out._length = maxSize;
  }

  /** @internal */
  _mask: number[] = [];
  /** @internal */
  _length: number = 0;

  /**
   * Enable one macro in this macro collection.
   * @param macro - ShaderMacro
   */
  enable(macro: ShaderMacro): void {
    const index = macro._index;
    const size = index + 1;
    const mask = this._mask;
    let maskStart = this._length; // must from this._length because this._length maybe less than mask.length and have dirty data should clear.
    if (maskStart < size) {
      mask.length < size && (mask.length = size); // mask.length maybe small than size,maybe not.
      for (; maskStart < index; maskStart++) {
        mask[maskStart] = 0;
      }
      mask[index] = macro._value;
      this._length = size;
    } else {
      mask[index] |= macro._value;
    }
  }

  /**
   * Disable one macro in this macro collection.
   * @param macro - ShaderMacro
   */
  disable(macro: ShaderMacro): void {
    const index = macro._index;
    const mask = this._mask;
    const endIndex = this._length - 1;
    if (index > endIndex) {
      return;
    }
    const newValue = mask[index] & ~macro._value;
    if (index == endIndex && newValue === 0) {
      this._length--;
    } else {
      mask[index] = newValue;
    }
  }

  /**
   * Union of this and other macro collection.
   * @param macroCollection - macro collection
   */
  unionCollection(macroCollection: ShaderMacroCollection): void {
    const addMask = macroCollection._mask;
    const addSize = macroCollection._length;
    const mask = this._mask;
    const maskSize = this._length;
    if (maskSize < addSize) {
      mask.length < addSize && (mask.length = addSize);
      let i = 0;
      for (; i < maskSize; i++) {
        mask[i] |= addMask[i];
      }
      for (; i < addSize; i++) {
        mask[i] = addMask[i];
      }
      this._length = addSize;
    } else {
      for (let i = 0; i < addSize; i++) {
        mask[i] |= addMask[i];
      }
    }
  }

  /**
   * Complementarity of this and other macro collection.
   * @param macroCollection - macro collection
   */
  complementaryCollection(macroCollection: ShaderMacroCollection): void {
    const removeMask = macroCollection._mask;
    const mask = this._mask;
    let endIndex = this._length - 1;
    let i = Math.min(macroCollection._length - 1, endIndex);
    for (; i >= 0; i--) {
      const newValue = mask[i] & ~removeMask[i];
      if (i == endIndex && newValue === 0) {
        endIndex--;
        this._length--;
      } else {
        mask[i] = newValue;
      }
    }
  }

  /**
   * Intersection of this and other macro collection.
   * @param macroCollection - macro collection
   */
  intersectionCollection(macroCollection: ShaderMacroCollection): void {
    const unionMask = macroCollection._mask;
    const mask = this._mask;
    for (let i = this._length - 1; i >= 0; i--) {
      const value = mask[i] & unionMask[i];
      if (value == 0 && i == this._length - 1) {
        this._length--;
      } else {
        mask[i] = value;
      }
    }
  }

  /**
   * Whether macro is enabled in this macro collection.
   * @param macro - ShaderMacro
   */
  isEnable(macro: ShaderMacro): boolean {
    const index = macro._index;
    if (index >= this._length) {
      return false;
    }
    return (this._mask[index] & macro._value) !== 0;
  }

  /**
   * Clear this macro collection.
   */
  clear(): void {
    this._length = 0;
  }
}
