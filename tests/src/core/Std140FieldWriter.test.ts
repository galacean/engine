import { describe, expect, it } from "vitest";
import { Std140FieldWriter } from "../../../packages/core/src/shader/Std140FieldWriter";

describe("Std140FieldWriter", () => {
  it("updates a short joint palette in place and clears the entire unused matrix range", () => {
    const jointCapacity = 1012;
    const length = 16 * jointCapacity;
    const writer = new Std140FieldWriter("mat4", jointCapacity, 64, 16);
    const output = new Float32Array(length + 2).fill(37);
    const palette = new Float32Array(16 * 43).fill(8);
    writer.write(output, 1, palette);
    expect(output[palette.length]).toBe(8);
    palette[3] = -0;
    const short = palette.subarray(0, 16 * 21);
    writer.write(output, 1, short);
    expect(output[4]).toBe(-0);
    expect(output[short.length]).toBe(8);
    expect(output.subarray(1 + short.length, 1 + length).every((value) => value === 0)).toBe(true);
    writer.write(output, 1, undefined);
    expect(output.subarray(1, 1 + length).every((value) => Object.is(value, 0))).toBe(true);
    expect([output[0], output[length + 1]]).toEqual([37, 37]);
  });

  it("preserves integer words and padding adjacent to vec3 and mat3", () => {
    const integers = new Int32Array(10).fill(99);
    new Std140FieldWriter("ivec4", 2, 16).write(integers, 1, new Int32Array([-2147483648, 2147483647]));
    expect(Array.from(integers)).toEqual([99, -2147483648, 2147483647, 0, 0, 0, 0, 0, 0, 99]);

    const vectors = new Float32Array(8).fill(99);
    new Std140FieldWriter("vec3", 2, 16).write(vectors, 0, new Float32Array([1, 2]));
    expect(Array.from(vectors)).toEqual([1, 2, 0, 99, 0, 0, 0, 99]);
    const matrix = new Float32Array(12).fill(99);
    new Std140FieldWriter("mat3", 0, 0, 16).write(matrix, 0, new Float32Array([1, 2, 3, 4]));
    expect(Array.from(matrix)).toEqual([1, 2, 3, 99, 4, 0, 0, 99, 0, 0, 0, 99]);
  });
});
