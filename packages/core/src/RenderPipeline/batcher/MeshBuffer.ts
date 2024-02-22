import { Engine } from "../../Engine";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  IndexFormat,
  SetDataOptions,
  VertexElement,
  VertexElementFormat
} from "../../graphic";
import { BufferMesh } from "../../mesh";
import { Batcher2D } from "./Batcher2D";

/**
 * @internal
 */
export class MeshBuffer {
  /** @internal */
  _mesh: BufferMesh;
  /** @internal */
  _vBuffer: Buffer;
  /** @internal */
  _iBuffer: Buffer;
  /** @internal */
  _vertices: Float32Array;
  /** @internal */
  _indices: Uint16Array;

  constructor(engine: Engine) {
    const mesh = (this._mesh = new BufferMesh(engine));
    mesh.isGCIgnored = true;

    const vertexElements: VertexElement[] = [];
    const vertexStride = this.createVertexElements(vertexElements);
    const { MAX_VERTEX_COUNT } = Batcher2D;
    // vertices
    const vertexBuffer = (this._vBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      MAX_VERTEX_COUNT * vertexStride,
      BufferUsage.Dynamic
    ));
    vertexBuffer.isGCIgnored = true;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 9);
    // indices
    const indiceBuffer = (this._iBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      MAX_VERTEX_COUNT * 8,
      BufferUsage.Dynamic
    ));
    indiceBuffer.isGCIgnored = true;
    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setIndexBufferBinding(indiceBuffer, IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT * 4);
  }

  destroy(): void {
    this._mesh.destroy();
    this._mesh = null;
    this._vBuffer.destroy();
    this._vBuffer = null;
    this._iBuffer.destroy();
    this._iBuffer = null;
    this._vertices = null;
    this._indices = null;
  }

  uploadBuffer(vLen: number, iLen: number): void {
    // Set data option use Discard, or will resulted in performance slowdown when open antialias and cross-rendering of 3D and 2D elements.
    // Device: iphone X(16.7.2)、iphone 15 pro max(17.1.1)、iphone XR(17.1.2) etc.
    this._vBuffer.setData(this._vertices, 0, 0, vLen, SetDataOptions.Discard);
    this._iBuffer.setData(this._indices, 0, 0, iLen, SetDataOptions.Discard);
  }

  createVertexElements(vertexElements: VertexElement[]): number {
    vertexElements[0] = new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0);
    vertexElements[1] = new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0);
    vertexElements[2] = new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0);
    return 36;
  }
}
