import { Vector3 } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Mesh } from "../geometry/Mesh";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";

/**
 * Basic shape geometry.
 */
export class ShapeGeometry extends Mesh {
  /**
   * @internal
   */
  _initialize(engine: Engine, vertices: Float32Array, indices: Uint16Array) {
    const vertexStride = 32;
    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0)
    ];

    this._initBuffer(engine, vertices, indices, vertexStride, vertexElements);
  }

  _initBuffer(
    engine: Engine,
    vertices: Float32Array,
    indices: Uint16Array,
    vertexStride: number,
    vertexElements: VertexElement[]
  ) {
    const positionElement = vertexElements[0];
    const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);

    this.setVertexBufferBinding(vertexBuffer, vertexStride);
    this.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);
    this.setVertexElements(vertexElements);
    this.addSubMesh(0, indices.length);

    this._computeBounds(positionElement, vertices);
  }

  private _computeBounds(positionElement: VertexElement, vertices: ArrayBuffer | Float32Array): void {
    const vertexElement = positionElement;
    const bufferIndex = vertexElement.bindingIndex;
    const vertexBufferBinding = this._primitive.vertexBufferBindings[bufferIndex];
    const stride = vertexBufferBinding.stride;
    const offset = vertexElement.offset;
    const vertexCount = vertexBufferBinding.buffer.byteLength / stride;
    let arrayBuffer: ArrayBuffer = vertices;
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      arrayBuffer = (<Float32Array>arrayBuffer).buffer;
    }
    const dataView = new DataView(arrayBuffer, offset);

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < vertexCount; i++) {
      const base = offset + stride * i;
      const position = new Vector3(
        dataView.getFloat32(base, true),
        dataView.getFloat32(base + 4, true),
        dataView.getFloat32(base + 8, true)
      );
      Vector3.min(min, position, min);
      Vector3.max(max, position, max);
    }

    const bounds = this.bounds;
    min.cloneTo(bounds.min);
    max.cloneTo(bounds.max);
  }
}
