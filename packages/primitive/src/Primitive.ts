import { BufferUsage, DataType, DrawMode, UpdateType } from "@alipay/o3-core";
import { AssetObject } from "@alipay/o3-core";
import { BoundingSphere, OBB } from "@alipay/o3-bounding-info";
import { Vector3, Matrix4x4 } from "@alipay/o3-math";

// TODO Destroy VAO and Buffer，ref to rhi refactor

export interface Attribute {
  name?: string;
  semantic: string;
  size: number;
  type: DataType;
  normalized?: boolean;
  instanced?: number;
  stride?: number;
  offset?: number;
  vertexBufferIndex?: number;
}

let primitiveID = 0;

/**
 * primitive(triangles, lines) data, vbo+indices, equal glTF meshes.primitives define
 * @class
 * @private
 */
export class Primitive extends AssetObject {
  public readonly id: number;
  public mode: DrawMode = DrawMode.TRIANGLES; // draw mode, triangles, lines etc.;
  public usage: BufferUsage = BufferUsage.STATIC_DRAW;
  public updateType: UpdateType = UpdateType.UPDATE_ALL;
  public updateRange: { byteOffset: number; byteLength: number } = {
    byteOffset: -1,
    byteLength: 0
  };

  public vertexBuffers = [];
  public vertexAttributes = <any>{};
  public vertexOffset: number = 0;
  public vertexCount: number = 0;

  public indexType: DataType.UNSIGNED_BYTE | DataType.UNSIGNED_SHORT | DataType.UNSIGNED_INT = DataType.UNSIGNED_SHORT;
  public indexCount: number = 0;
  public indexBuffer = null;
  public indexOffset: number = 0;
  public indexNeedUpdate: boolean = false;

  public material = null;
  public materialIndex: number;
  public targets: any[] = [];
  public boundingBox: OBB = null;
  public boundingSphere: BoundingSphere = null;
  public isInFrustum: boolean = true;

  public instancedBuffer = null;
  public instancedAttributes = {};
  public isInstanced: boolean = false;

  public updateVertex: boolean;
  public updateInstanced: boolean;
  public instancedCount: number;

  /**
   * @constructor
   */
  constructor(name?: string) {
    super();
    this.id = primitiveID++;
  }

  /**
   * 添加一个顶点属性
   * @param {string} semantic
   * @param {number} size
   * @param {DataType} type
   * @param {boolean} normalized
   * @param {number} stride
   * @param {number} offset
   * @param {number} vertexBufferIndex
   */
  addAttribute({ size, type, stride, offset, semantic, normalized, instanced = 0, vertexBufferIndex = 0 }: Attribute) {
    this[instanced ? "instancedAttributes" : "vertexAttributes"][semantic] = {
      size,
      type,
      stride,
      offset,
      semantic,
      instanced,
      normalized,
      vertexBufferIndex
    };
    if (instanced) {
      this.isInstanced = true;
    }
  }

  updateWeightsIndices(indices: number[]) {
    if (this.targets.length !== indices.length || indices.length === 0) {
      return;
    }
    for (let i = 0; i < indices.length; i++) {
      const currentIndex = indices[i];
      Object.keys(this.targets[i]).forEach((key: string) => {
        const semantic = this.targets[i][key].name;
        const index = this.targets[currentIndex][key].vertexBufferIndex;
        this.updateAttribBufferIndex(semantic, index);
      });
    }
  }

  updateAttribBufferIndex(semantic: string, index: number) {
    this.vertexAttributes[semantic].vertexBufferIndex = index;
  }

  /**
   * 重置更新范围对象
   */
  resetUpdateRange() {
    this.updateRange.byteOffset = -1;
    this.updateRange.byteLength = 0;
  }

  /**
   * 通过 primitive 计算本地/世界坐标系的 min/max
   * @param {Matrix4x4} modelMatrix - Local to World矩阵,如果传此值，则计算min/max时将考虑RTS变换，如果不传，则计算local min/max
   * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
   * */
  getMinMax(modelMatrix?: Matrix4x4, littleEndian = true) {
    let {
      vertexCount,
      vertexBuffers,
      vertexAttributes: {
        POSITION: { size, offset, stride, vertexBufferIndex }
      }
    } = this;
    let arrayBuffer = vertexBuffers[vertexBufferIndex];
    if (!(arrayBuffer instanceof ArrayBuffer)) {
      arrayBuffer = arrayBuffer.buffer;
    }
    if (stride === 0) {
      stride = size * 4;
    }
    const dataView = new DataView(arrayBuffer, offset);

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < vertexCount; i++) {
      const base = offset + stride * i;
      const position = new Vector3(
        dataView.getFloat32(base, littleEndian),
        dataView.getFloat32(base + 4, littleEndian),
        dataView.getFloat32(base + 8, littleEndian)
      );
      modelMatrix && Vector3.transformMat4x4Coordinate(position, modelMatrix, position);
      Vector3.min(min, position, min);
      Vector3.max(max, position, max);
    }

    return {
      min,
      max
    };
  }

  get attributes() {
    return {
      ...this.vertexAttributes,
      ...this.instancedAttributes
    };
  }

  finalize() {}
}
