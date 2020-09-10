import { BufferGeometry } from "../geometry/BufferGeometry";

import { Engine } from "../Engine";
import { BufferUsage } from "../geometry/graphic/enums/BufferUsage";
import { IndexFormat } from "../geometry/graphic/enums/IndexFormat";
import { VertexElementFormat } from "../geometry/graphic/enums/VertexElementFormat";
import { IndexBuffer } from "../geometry/graphic/IndexBuffer";
import { VertexBuffer } from "../geometry/graphic/VertexBuffer";
import { VertexDeclaration } from "../geometry/graphic/VertexDeclaration";
import { VertexElement } from "../geometry/graphic/VertexElement";
import { VertexBufferBinding } from "../geometry/graphic/VertexBufferBinding";

/**
 * 基本形状几何体。
 */
export class GeometryShape extends BufferGeometry {
  /**
   * @internal
   */
  _initialize(engine: Engine, vertices: Float32Array, indices: Uint16Array) {
    engine = engine || Engine._getDefaultEngine();

    const vertexStride = 32;
    const declaration: VertexDeclaration = new VertexDeclaration([
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0)
    ]);

    this._init(engine, vertices, indices, vertexStride, declaration);
  }

  // TODO api命名待定
  _init(
    engine: Engine,
    vertices: Float32Array,
    indices: Uint16Array,
    vertexStride: number,
    declaration: VertexDeclaration
  ) {
    const vertexBufferlength = vertices.byteLength;
    const vertexBuffer = new VertexBuffer(vertexBufferlength, BufferUsage.Static, engine);
    const indexBuffer = new IndexBuffer(indices.length, IndexFormat.UInt16, BufferUsage.Static, engine);

    vertexBuffer.setData(vertices);
    this.primitive.setVertexDeclaration(declaration);
    this.addVertexBuffer(new VertexBufferBinding(vertexBuffer, vertexStride), null);
    this.vertexCount = vertexBufferlength / vertexStride;

    indexBuffer.setData(indices);
    this.setIndexBuffer(indexBuffer, null);
    this.indexCount = indices.length;

    this._getMinMax(vertices);
  }
}
