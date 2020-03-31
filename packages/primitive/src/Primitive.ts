import { BufferUsage, DataType, DrawMode, UpdateType } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { BoundingSphere, OBB } from "@alipay/o3-bounding-info";
import { Mat4 } from "@alipay/o3-math/types/type";
import { vec3 } from "@alipay/o3-math";

export interface Attribute {
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
  public mode: DrawMode;
  public usage: BufferUsage;
  public updateType: UpdateType;
  public updateRange: { byteOffset: number; byteLength: number };

  public vertexBuffers;
  public vertexAttributes;
  public vertexOffset: number;
  public vertexCount: number;

  public indexType: DataType.UNSIGNED_BYTE | DataType.UNSIGNED_SHORT | DataType.UNSIGNED_INT;
  public indexCount: number;
  public indexBuffer;
  public indexOffset: number;
  public indexNeedUpdate: boolean;

  public material;
  public materialIndex: number;
  public targets: any[];
  public boundingBox: OBB;
  public boundingSphere: BoundingSphere;
  public isInFrustum: boolean;

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
    super(name !== undefined ? name : "DEFAULT_PRIMITIVENAME_" + primitiveID);
    this.id = primitiveID++;
    this.mode = DrawMode.TRIANGLES; // draw mode, triangles, lines etc.
    this.usage = BufferUsage.STATIC_DRAW;
    this.updateType = UpdateType.UPDATE_ALL;
    this.updateRange = {
      byteOffset: -1,
      byteLength: 0
    };

    //-- 顶点数据
    this.vertexBuffers = []; // ArrayBuffer，一个Primitive可能包含1个或多个顶点缓冲
    this.vertexAttributes = {}; // vertex attributes: dict object, [senmatic]-->VertexAttribute
    this.vertexOffset = 0;
    this.vertexCount = 0;

    //-- index 数据，可能为null
    this.indexType = DataType.UNSIGNED_SHORT;
    this.indexCount = 0; // number of elements
    this.indexBuffer = null; // ArrayBuffer object
    this.indexOffset = 0;
    this.indexNeedUpdate = false;

    //--
    this.material = null; // default material objects
    this.targets = []; // MorphTarget array
    this.boundingBox = null;
    this.boundingSphere = null;
    this.isInFrustum = true;
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
   * @param {Mat4} modelMatrix - Local to World矩阵,如果传此值，则计算min/max时将考虑RTS变换，如果不传，则计算local min/max
   * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
   * */
  getMinMax(modelMatrix?: Mat4, littleEndian = true) {
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

    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i++) {
      const base = offset + stride * i;
      const position = [
        dataView.getFloat32(base, littleEndian),
        dataView.getFloat32(base + 4, littleEndian),
        dataView.getFloat32(base + 8, littleEndian)
      ];
      modelMatrix && vec3.transformMat4(position, position, modelMatrix);
      vec3.min(min, min, position);
      vec3.max(max, max, position);
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
