import { AssetObject } from "../asset/AssetObject";
import { BoundingSphere } from "../bounding-info/BoudingSphere";
import { OBB } from "../bounding-info/OBB";
import { BufferUtil, IndexBuffer, IndexFormat, VertexElement, VertexElements } from "../geometry";
import { PrimitiveTopology } from "../geometry/graphic/enums/PrimitiveTopology";
import { IndexBufferBinding } from "../geometry/graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../geometry/graphic/VertexBufferBinding";

// TODO Destroy VAO and Buffer，ref to rhi refactor
/**
 * primitive(triangles, lines) data, vbo+indices, equal glTF meshes.primitives define
 * @private
 */
export class Primitive extends AssetObject {
  private static _primitiveID: number = 0;

  /** 绘制模式。*/
  primitiveTopology: PrimitiveTopology = PrimitiveTopology.TRIANGLES;
  /** 绘制偏移。*/
  drawOffset: number = 0;
  /** 绘制数量。*/
  drawCount: number = 0;
  /** 实例数量，0 表示关闭实例渲染。*/
  instanceCount: number = 0;

  _glIndexType: number;

  _vertexElementMap: VertexElements = {};

  private _vertexBufferBindings: VertexBufferBinding[] = [];
  private _vertexElements: VertexElement[] = [];
  private _indexBufferBinding: IndexBufferBinding = new IndexBufferBinding();

  /**
   * 顶点缓冲绑定信息集合。
   */
  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._vertexBufferBindings;
  }

  /**
   * 顶点元素集合。
   */
  get vertexElements(): Readonly<VertexElement[]> {
    return this._vertexElements;
  }

  /**
   * 索引缓冲绑定信息。
   */
  get indexBufferBinding(): IndexBufferBinding {
    return this._indexBufferBinding;
  }

  readonly id: number;
  material = null;
  materialIndex: number;
  targets: any[] = [];
  boundingBox: OBB = null;
  boundingSphere: BoundingSphere = null;
  isInFrustum: boolean = true;

  get attributes() {
    return this._vertexElementMap;
  }

  constructor(name?: string) {
    super();
    this.id = Primitive._primitiveID++;
    this.name = name;
  }

  /**
   * 设置顶点缓冲绑定信息。
   * @param bufferBindings - 缓冲绑定集合
   * @param firstIndex - 第一个绑定索引
   */
  setVertexBuffers(bufferBindings: VertexBufferBinding | VertexBufferBinding[], firstIndex: number = 0): void {
    const bindings = this._vertexBufferBindings;
    const isArray = (<VertexBufferBinding[]>bufferBindings).length !== undefined;
    if (isArray) {
      const addBindings = <VertexBufferBinding[]>bufferBindings;
      const count = addBindings.length;
      const needLength = firstIndex + count;
      bindings.length < needLength ?? (bindings.length = needLength);
      for (let i = 0; i < count; i++) {
        this._vertexBufferBindings[firstIndex + i] = addBindings[i];
      }
    } else {
      const needLength = firstIndex + 1;
      bindings.length < needLength ?? (bindings.length = needLength);
      this._vertexBufferBindings[firstIndex] = <VertexBufferBinding>bufferBindings;
    }
  }

  /**
   * 添加顶点元素集合。
   * @param elements
   */
  addVertexElements(elements: VertexElement | VertexElement[]): void {
    const isArray = (<VertexElement[]>elements).length !== undefined;
    if (isArray) {
      const addElements = <VertexElement[]>elements;
      for (let i = 0, n = addElements.length; i < n; i++) {
        this._addVertexElement(addElements[i]);
      }
    } else {
      this._addVertexElement(<VertexElement>elements);
    }
  }

  removeVertexElements(vertexElements: VertexElement | VertexElement[]): void {}

  /**
   * 设置索引缓冲。
   * @param buffer - 索引缓冲
   * @param format - 索引缓冲格式
   */
  setIndexBuffer(buffer: IndexBuffer, format: IndexFormat): void {
    const binding = this._indexBufferBinding;
    binding._buffer = buffer;
    binding._format = format;
    this._glIndexType = BufferUtil._getGLIndexType(format);
  }

  // updateWeightsIndices(indices: number[]) {
  //   if (this.targets.length !== indices.length || indices.length === 0) {
  //     return;
  //   }
  //   for (let i = 0; i < indices.length; i++) {
  //     const currentIndex = indices[i];
  //     Object.keys(this.targets[i]).forEach((key: string) => {
  //       const semantic = this.targets[i][key].name;
  //       const index = this.targets[currentIndex][key].vertexBufferIndex;
  //       // this.updateAttribBufferIndex(semantic, index);
  //     });
  //   }
  // }

  // updateAttribBufferIndex(semantic: string, index: number) {
  //   this.vertexAttributes[semantic].vertexBufferIndex = index;
  // }

  destroy() {}

  reset() {
    this.primitiveTopology = PrimitiveTopology.TRIANGLES;
    this._vertexElementMap = {};
    this._vertexBufferBindings = [];

    this._indexBufferBinding = new IndexBufferBinding();
    this.drawOffset = 0;
    this.drawCount = 0;

    this.material = null;
    this.materialIndex = null;
    this.targets = [];
    this.boundingBox = null;
    this.boundingSphere = null;
    this.isInFrustum = true;
    this.instanceCount = null;
  }

  private _addVertexElement(element: VertexElement): void {
    const { semantic } = element;
    if (this._vertexElementMap[semantic]) {
      throw "the same semantic already exists.";
    }
    this._vertexElementMap[semantic] = element;
    this._vertexElements.push(element);
  }
}
