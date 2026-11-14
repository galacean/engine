import { describe, expect, it } from "vitest";
import { BufferReader } from "../../../packages/loader/src/resource-deserialize/utils/BufferReader";

describe("BufferReader packed float arrays", () => {
  it.each([0, 1, 2, 3])(
    "reads arrays from a byte view at relative offset %s and advances to the next field",
    (offset) => {
      const backing = new ArrayBuffer(40);
      const data = new Uint8Array(backing, 3, 24);
      const absoluteOffset = data.byteOffset + offset;
      const view = new DataView(backing);
      view.setFloat32(absoluteOffset, 1.25, true);
      view.setFloat32(absoluteOffset + 4, -3.5, true);
      view.setUint16(absoluteOffset + 8, 0xc0de, true);
      const reader = new BufferReader(data, offset, 10);
      expect(reader.nextFloat32Array(0)).toHaveLength(0);
      expect(reader.position).toBe(0);
      const values = reader.nextFloat32Array(2);
      expect(Array.from(values)).toEqual([1.25, -3.5]);
      expect(reader.position).toBe(8);
      expect(reader.offset).toBe(offset + 8);
      expect(reader.nextUint16()).toBe(0xc0de);
      expect(reader.position).toBe(10);
      if (absoluteOffset % Float32Array.BYTES_PER_ELEMENT === 0) {
        expect(values.buffer).toBe(backing);
        expect(values.byteOffset).toBe(absoluteOffset);
      }
    }
  );
});
