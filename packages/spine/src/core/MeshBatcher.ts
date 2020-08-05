import { GeometryRenderer, BufferGeometry, InterleavedBuffer, IndexBuffer } from "@alipay/o3-geometry";
import { DataType, BufferUsage, UpdateType } from "@alipay/o3-base";
import { BufferAttribute } from "@alipay/o3-primitive";
import { SkeletonMeshMaterial } from "./SkeletonMeshMaterial";

export class MeshBatcher extends GeometryRenderer {
  private static VERTEX_SIZE = 9;
  private vertexCount;
  private vertices;
  private maxVertices;
  private verticesLength = 0;
  private indices: Uint16Array;
  private indicesLength = 0;

  _geometry;
  _material;

  constructor(name, { maxVertices }) {
    super(name);
    if (maxVertices === undefined) {
      throw new Error("Must pass maxVertices numbers");
    }
    this.maxVertices = maxVertices;
    this.vertices = new Float32Array(maxVertices * MeshBatcher.VERTEX_SIZE);
    const vertexCount = maxVertices;
    this.vertexCount = vertexCount;
    const geo = new BufferGeometry();
    const indices = (this.indices = new Uint16Array(maxVertices * 3));
    const position = new BufferAttribute({
      semantic: "POSITION",
      size: 3,
      type: DataType.FLOAT,
      normalized: false,
      usage: BufferUsage.DYNAMIC_DRAW
    });
    const color = new BufferAttribute({
      semantic: "COLOR",
      size: 4,
      type: DataType.FLOAT,
      normalized: false,
      usage: BufferUsage.DYNAMIC_DRAW
    });
    const uv = new BufferAttribute({
      semantic: "TEXCOORD_0",
      size: 2,
      type: DataType.FLOAT,
      normalized: false,
      usage: BufferUsage.DYNAMIC_DRAW
    });

    const vertexBuffer = new InterleavedBuffer([position, color, uv], vertexCount);
    const indexBuffer = new IndexBuffer(indices.length, BufferUsage.DYNAMIC_DRAW);

    geo.addVertexBufferParam(vertexBuffer);
    geo.addIndexBufferParam(indexBuffer);

    this._geometry = geo;
    this._material = new SkeletonMeshMaterial("skeletion_material");
  }

  clear() {}

  begin() {
    this.verticesLength = 0;
    this.indicesLength = 0;
  }

  canBatch(verticesLength: number, indicesLength: number) {
    if (this.indicesLength + indicesLength >= this.indices.byteLength / 2) return false;
    if (this.verticesLength + verticesLength >= (this.vertexCount * MeshBatcher.VERTEX_SIZE) / 2) return false;
    return true;
  }

  batch(vertices, verticesLength: number, indices, indicesLength: number, z: number = 0) {
    let indexStart = this.verticesLength / MeshBatcher.VERTEX_SIZE;
    let vertexBuffer = this.vertices;
    let i = this.verticesLength;
    let j = 0;
    for (; j < verticesLength; ) {
      vertexBuffer[i++] = vertices[j++];
      vertexBuffer[i++] = vertices[j++];
      vertexBuffer[i++] = z;
      vertexBuffer[i++] = vertices[j++];
      vertexBuffer[i++] = vertices[j++];
      vertexBuffer[i++] = vertices[j++];
      vertexBuffer[i++] = vertices[j++];
      vertexBuffer[i++] = vertices[j++];
      vertexBuffer[i++] = vertices[j++];
    }
    this.setValueFromBuffer();
    this.verticesLength = i;
    let indicesArray = this.indices;
    for (i = this.indicesLength, j = 0; j < indicesLength; i++, j++) {
      indicesArray[i] = indices[j] + indexStart;
    }
    this.indicesLength += indicesLength;
    this._geometry.setIndexBufferData(indicesArray);
  }

  setValueFromBuffer() {
    let vertexBuffer = this.vertices;
    for (let i = 0, j = 0; i < this.maxVertices; i += 1, j += 9) {
      const position = [vertexBuffer[j], vertexBuffer[j + 1], vertexBuffer[j + 2]];
      const color = [vertexBuffer[j + 3], vertexBuffer[j + 4], vertexBuffer[j + 5], vertexBuffer[j + 6]];
      const uv = [vertexBuffer[j + 7], vertexBuffer[j + 8]];
      this.geometry.setVertexBufferDataByIndex("POSITION", i, position);
      this.geometry.setVertexBufferDataByIndex("COLOR", i, color);
      this.geometry.setVertexBufferDataByIndex("TEXCOORD_0", i, uv);
    }
  }

  end() {
    // end batch
  }
}
