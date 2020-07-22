import { VertexBuffer } from "./VertexBuffer";
import { BufferAttribute } from "../index";

/**
 * InterleavedBuffer
 * 只包含非instanced的插值buffer
 */
export class InterleavedBuffer extends VertexBuffer {
  private stride: number;
  readonly isInterleaved = true;

  constructor(attributes: BufferAttribute[], vertexCount: number) {
    super(attributes, vertexCount);
    this.initialize(attributes, vertexCount);
  }

  initialize(attributes: BufferAttribute[], vertexCount: number) {
    const attribCount = attributes.length;
    let stride = 0;
    for (let i = 0; i < attribCount; i++) {
      const attribute = attributes[i];
      attribute.offset = stride;
      attribute.interleaved = true;
      attribute[i].vertexBufferIndex = this.startBufferIndex;
      stride += this._getSizeInByte(attribute.size, attribute.type);
    }
    for (let i = 0; i < attribCount; i++) {
      const attribute = attributes[i];
      attribute.stride = stride;
    }
    const buffer = new ArrayBuffer(vertexCount * stride);
    this.buffers[0] = buffer;
  }

  getIndex() {}
}
