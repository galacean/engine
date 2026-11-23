import { DataType, IndexFormat, MeshTopology } from "@galacean/engine-core";

/** Native primitive constants shared by draws, VAOs and transform feedback on one graphics device. */
export class GLPrimitiveFormats {
  readonly topology: Record<MeshTopology, GLenum>;
  readonly index: Record<IndexFormat, { type: GLenum; bytes: number }>;
  readonly vertexType: Record<number, GLenum>;

  constructor(gl: WebGL2RenderingContext) {
    this.topology = {
      [MeshTopology.Points]: gl.POINTS,
      [MeshTopology.Lines]: gl.LINES,
      [MeshTopology.LineLoop]: gl.LINE_LOOP,
      [MeshTopology.LineStrip]: gl.LINE_STRIP,
      [MeshTopology.Triangles]: gl.TRIANGLES,
      [MeshTopology.TriangleStrip]: gl.TRIANGLE_STRIP,
      [MeshTopology.TriangleFan]: gl.TRIANGLE_FAN
    };
    this.index = {
      [IndexFormat.UInt8]: { type: gl.UNSIGNED_BYTE, bytes: Uint8Array.BYTES_PER_ELEMENT },
      [IndexFormat.UInt16]: { type: gl.UNSIGNED_SHORT, bytes: Uint16Array.BYTES_PER_ELEMENT },
      [IndexFormat.UInt32]: { type: gl.UNSIGNED_INT, bytes: Uint32Array.BYTES_PER_ELEMENT }
    };
    this.vertexType = {
      [DataType.FLOAT]: gl.FLOAT,
      [DataType.BYTE]: gl.BYTE,
      [DataType.UNSIGNED_BYTE]: gl.UNSIGNED_BYTE,
      [DataType.SHORT]: gl.SHORT,
      [DataType.UNSIGNED_SHORT]: gl.UNSIGNED_SHORT,
      [DataType.UNSIGNED_INT]: gl.UNSIGNED_INT
    };
  }
}
