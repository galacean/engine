import { Vector3 } from "@alipay/o3-math";
import { Engine } from "../Engine";
import { BufferGeometry } from "../geometry/BufferGeometry";
import { BufferUsage } from "../geometry/graphic/enums/BufferUsage";
import { IndexFormat } from "../geometry/graphic/enums/IndexFormat";
import { VertexElementFormat } from "../geometry/graphic/enums/VertexElementFormat";
import { IndexBuffer } from "../geometry/graphic/IndexBuffer";
import { VertexBuffer } from "../geometry/graphic/VertexBuffer";
import { VertexBufferBinding } from "../geometry/graphic/VertexBufferBinding";
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
    const declaration: VertexDeclaration = new VertexDeclaration([
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 24, VertexElementFormat.Vector2, 0)
    ]);

    this._initBuffer(engine, vertices, indices, vertexStride, declaration);
  }

  private _initBuffer(
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
    this.addVertexBuffer(new VertexBufferBinding(vertexBuffer, vertexStride));
    this.vertexCount = vertexBufferlength / vertexStride;

    indexBuffer.setData(indices);
    this.setIndexBuffer(indexBuffer);
    this.indexCount = indices.length;

    this._computeBounds(vertices);
  }

  private _computeBounds(vertices: ArrayBuffer | Float32Array): void {
    debugger;
    const vertexElement = this.primitive.vertexAttributes["POSITION"];
    const bufferIndex = vertexElement.vertexBufferSlot;
    const stride = this.primitive.vertexBufferBindings[bufferIndex].stride;
    const offset = vertexElement.offset;
    const vertexCount = this.vertexCount;
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

    let bounds = this.bounds;
    if (bounds) {
      min.cloneTo(bounds.min);
      max.cloneTo(bounds.max);
    } else {
      bounds = { min: min, max: max };
      this.bounds = bounds;
    }
  }
}
