import type { Color, Matrix, Vector4 } from "@galacean/engine-math";
import type { ShaderPropertyValueType } from "./ShaderData";

type WordView = Float32Array | Int32Array;

/** Packs tightly stored ShaderData values using compiler-supplied std140 byte strides. */
export class Std140FieldWriter {
  private static readonly _components = [0, 0, 0, 0];
  readonly useIntView: boolean;
  private readonly _arrayCount: number;
  private readonly _arrayStride: number;
  private readonly _columns: number;
  private readonly _rows: number;
  private readonly _matrixStride: number;
  private readonly _contiguousLength: number;

  constructor(type: string, arrayLength = 0, arrayStride = 0, matrixStride = 0) {
    const matrix = /^mat([234])(?:x([234]))?$/.exec(type);
    const vector = /^[iub]?vec([234])$/.exec(type);
    if (!matrix && !vector && !/^(float|int|uint|bool)$/.test(type)) {
      throw new Error(`Unsupported uniform block member type ${type}.`);
    }
    this.useIntView = /^[iub]/.test(type);
    this._arrayCount = arrayLength || 1;
    this._arrayStride = arrayStride / 4;
    this._matrixStride = matrix ? (matrixStride || 16) / 4 : 0;
    this._columns = matrix ? Number(matrix[1]) : 1;
    this._rows = matrix ? Number(matrix[2] || matrix[1]) : vector ? Number(vector[1]) : 1;
    const components = this._columns * this._rows;
    this._contiguousLength =
      (!matrix || this._matrixStride === this._rows) && (!arrayLength || this._arrayStride === components)
        ? components * this._arrayCount
        : 0;
  }

  write(view: WordView, offset: number, value: ShaderPropertyValueType | undefined): void {
    if (typeof value === "number") {
      this._writeVector(view, offset, value, 0, 0, 0);
    } else if (value && "x" in value) {
      const v = value as Vector4;
      this._writeVector(view, offset, v.x, v.y, v.z ?? 0, v.w ?? 0);
    } else if (value && "r" in value) {
      const color = value as Color;
      this._writeVector(view, offset, color.r, color.g, color.b, color.a);
    } else {
      // Matrix.elements and ShaderData arrays contain tightly packed column-major values.
      const source =
        value && "elements" in value ? (value as Matrix).elements : ArrayBuffer.isView(value) ? value : null;
      this._writeArray(view, offset, source);
    }
  }

  private _writeVector(view: WordView, offset: number, x: number, y: number, z: number, w: number): void {
    if (this._arrayStride === 0 && this._columns === 1) {
      view[offset] = x;
      if (this._rows > 1) view[offset + 1] = y;
      if (this._rows > 2) view[offset + 2] = z;
      if (this._rows > 3) view[offset + 3] = w;
      return;
    }
    const components = Std140FieldWriter._components;
    components[0] = x;
    components[1] = y;
    components[2] = z;
    components[3] = w;
    this._writeArray(view, offset, components);
  }

  private _writeArray(view: WordView, offset: number, source: ArrayLike<number> | null): void {
    const length = this._contiguousLength;
    const count = source?.length ?? 0;
    if (source && count === length && length > 0) {
      view.set(source, offset);
      return;
    }
    if (count < length) {
      // Keep numeric conversion and forward copy order for short inputs. A contiguous
      // field owns every word in the tail, even when the preceding draw used more values.
      if (source) {
        for (let i = 0; i < count; ++i) view[offset + i] = source[i] ?? 0;
      }
      view.fill(0, offset + count, offset + length);
      return;
    }
    let index = 0;
    for (let element = 0; element < this._arrayCount; ++element) {
      const base = offset + element * this._arrayStride;
      for (let col = 0; col < this._columns; ++col) {
        const column = base + col * this._matrixStride;
        for (let row = 0; row < this._rows; ++row) {
          view[column + row] = source?.[index++] ?? 0;
        }
      }
    }
  }
}
