import { DrawMode, DataType, BufferUsage, UpdateType } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";

let primitiveID = 0;

/**
 * primitive(triangles, lines) data, vbo+indices, equal glTF meshes.primitives define
 * @class
 * @private
 */
export class Primitive extends AssetObject {
  public readonly id: number;
  public mode: number;
  public usage: number;
  public updateType: number;
  public updateRange: { byteOffset: number; byteLength: number };
  public vertexBuffers;
  public vertexAttributes;
  public vertexOffset;
  public vertexCount;
  public indexType;
  public indexCount;
  public indexBuffer;
  public indexOffset;
  public material;
  public targets;
  public boundingBoxMax;
  public boundingBoxMin;
  public indexNeedUpdate: boolean;

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

    //--
    this.material = null; // default material objects
    this.targets = []; // MorphTarget array
    this.boundingBoxMax = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
    this.boundingBoxMin = [Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE];
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
  addAttribute(
    semantic: string,
    size: number,
    type: DataType,
    normalized: boolean,
    stride: number,
    offset: number,
    vertexBufferIndex: number
  ) {
    this.vertexAttributes[semantic] = {
      semantic,
      size,
      type,
      normalized,
      stride,
      offset,
      vertexBufferIndex
    };
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
}
