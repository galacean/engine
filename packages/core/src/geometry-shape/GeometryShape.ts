import { BufferGeometry } from "../geometry/BufferGeometry";

import { Engine } from "../Engine";
import { BufferUsage } from "../geometry/graphic/enums/BufferUsage";
import { IndexFormat } from "../geometry/graphic/enums/IndexFormat";
import { VertexElementFormat } from "../geometry/graphic/enums/VertexElementFormat";
import { IndexBuffer } from "../geometry/graphic/IndexBuffer";
import { VertexBuffer } from "../geometry/graphic/VertexBuffer";
import { VertexDeclaration } from "../geometry/graphic/VertexDeclaration";
import { VertexElement } from "../geometry/graphic/VertexElement";

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
    const vertexBufferlength = vertices.byteLength;
    const declaration: VertexDeclaration = new VertexDeclaration(vertexStride, [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0)
    ]);

    const vertexBuffer = new VertexBuffer(vertexBufferlength, BufferUsage.Static, engine);
    const indexBuffer = new IndexBuffer(indices.length, IndexFormat.UInt16, BufferUsage.Static, engine);
    vertexBuffer.setData(vertices);
    vertexBuffer.declaration = declaration;
    indexBuffer.setData(indices);

    this.addVertexBuffer(vertexBuffer, null);
    this.setIndexBuffer(indexBuffer, null);
    this.vertexCount = vertexBufferlength / vertexStride;
    this.indexCount = indices.length;

    this._getMinMax(vertices);
  }
}
