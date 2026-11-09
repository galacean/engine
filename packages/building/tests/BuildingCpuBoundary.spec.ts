import { describe, it, expect } from "vitest";
import { BufferUtil, VertexElementFormat, IndexFormat } from "@galacean/engine-core";
describe("native geometry CPU boundary", () => {
  it("reads interleaved normalized and integer attributes through the native buffer API without modifying storage", () => {
    const storage = new Uint8Array([99, 99, 128, 127, 0, 64, 7, 8, 255, 0, 127, 128, 9, 10, 99]);
    const data = storage.subarray(2, 14),
      before = storage.slice();
    expect(BufferUtil.getVertexElementData(data, VertexElementFormat.NormalizedByte4, 6, 0)).toEqual([
      -1,
      1,
      0,
      64 / 127,
      -1 / 127,
      0,
      1,
      -1
    ]);
    expect(storage).toEqual(before);
    const indices = new Uint8Array([99, 1, 0, 2, 0, 3, 0, 99]).subarray(1, 7);
    expect(BufferUtil.getIndexData(indices, IndexFormat.UInt16, 1, 2)).toEqual([2, 3]);
    expect(() => BufferUtil.getIndexData(indices, IndexFormat.UInt16, 1, 3)).toThrow();
    expect(() => BufferUtil.getVertexElementData(data, VertexElementFormat.Vector3, 6, 0)).toThrow();
  });
});
