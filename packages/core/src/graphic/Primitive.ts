import { Engine } from "..";
import { RefObject } from "../asset/RefObject";
import { BoundingSphere } from "../bounding-info/BoudingSphere";
import { OBB } from "../bounding-info/OBB";
import { Buffer } from "../graphic/Buffer";
import { BufferUtil } from "./BufferUtil";
import { IndexFormat } from "./enums/IndexFormat";
import { IndexBufferBinding } from "./IndexBufferBinding";
import { VertexBufferBinding } from "./VertexBufferBinding";
import { VertexElement } from "./VertexElement";

/**
 * @private
 */
export class Primitive extends RefObject {
  private static _primitiveID: number = 0;

  /** 实例数量，0 表示关闭实例渲染。*/
  instanceCount: number = 0;
  _vertexElementMap: object = {};
  _glIndexType: number;

  private _vertexBufferBindings: Readonly<VertexBufferBinding[]> = [];
  private _indexBufferBinding: IndexBufferBinding = null;
  private _vertexElements: VertexElement[] = [];

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
  targets: any[] = [];
  boundingBox: OBB = null;
  boundingSphere: BoundingSphere = null;
  isInFrustum: boolean = true;

  constructor(engine: Engine, name?: string) {
    super(engine);
    this.id = Primitive._primitiveID++;
    this.name = name;
  }

  /**
   * 设置顶点缓冲绑定。
   * @param vertexBuffer - 顶点缓冲
   * @param stride - 顶点缓冲跨度
   * @param firstIndex - 顶点缓冲绑定索引,默认值为 0
   */
  setVertexBufferBinding(vertexBuffer: Buffer, stride: number, firstIndex?: number): void;

  /**
   * 设置顶点缓冲绑定。
   * @param vertexBufferBinding - 顶点缓冲绑定
   * @param firstIndex - 顶点缓冲绑定索引,默认值为 0
   */
  setVertexBufferBinding(vertexBufferBinding: VertexBufferBinding, firstIndex?: number): void;

  setVertexBufferBinding(
    bufferOrBinding: Buffer | VertexBufferBinding,
    strideOrFirstIndex: number = 0,
    firstIndex: number = 0
  ): void {
    let binding = <VertexBufferBinding>bufferOrBinding;
    const isBinding = binding.buffer !== undefined;
    isBinding || (binding = new VertexBufferBinding(<Buffer>bufferOrBinding, strideOrFirstIndex));

    const bindings = this._vertexBufferBindings;
    //@ts-ignore
    bindings.length <= firstIndex && (bindings.length = firstIndex + 1);
    this._setVertexBufferBinding(isBinding ? strideOrFirstIndex : firstIndex, binding);
  }

  /**
   * 设置顶点缓冲绑定信息。
   * @param bufferBindings - 缓冲绑定集合
   * @param firstIndex - 第一个绑定索引
   */
  setVertexBufferBindings(bufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
    const bindings = this._vertexBufferBindings;
    const multiBindings = <VertexBufferBinding[]>bufferBindings;
    const count = multiBindings.length;
    const needLength = firstIndex + count;
    //@ts-ignore
    bindings.length < needLength && (bindings.length = needLength);
    for (let i = 0; i < count; i++) {
      this._setVertexBufferBinding(firstIndex + i, multiBindings[i]);
    }
  }

  /**
   * 设置索引缓冲绑定。
   * @param buffer - 索引缓冲
   * @param format - 索引缓冲格式
   */
  setIndexBufferBinding(buffer: Buffer, format: IndexFormat): void;

  /**
   * 设置索引缓冲绑定。
   * @param bufferBinding - 索引缓冲绑定
   */
  setIndexBufferBinding(bufferBinding: IndexBufferBinding): void;

  setIndexBufferBinding(bufferOrBinding: Buffer | IndexBufferBinding, format?: IndexFormat): void {
    let binding = <IndexBufferBinding>bufferOrBinding;
    const isBinding = binding.buffer !== undefined;
    isBinding || (binding = new IndexBufferBinding(<Buffer>bufferOrBinding, format));
    this._indexBufferBinding = binding;
    this._glIndexType = BufferUtil._getGLIndexType(binding.format);
  }

  /**
   * 设置顶点元素集合。
   * @param elements - 顶点元素集合
   */
  setVertexElements(elements: VertexElement[]): void {
    this._clearVertexElements();
    for (let i = 0, n = elements.length; i < n; i++) {
      this._addVertexElement(elements[i]);
    }
  }

  /**
   * 销毁。
   */
  onDestroy() {
    this._vertexBufferBindings = null;
    this._indexBufferBinding = null;
    this._vertexElements = null;
    this._vertexElementMap = null;
  }

  private _clearVertexElements(): void {
    this._vertexElements.length = 0;
    const vertexElementMap = this._vertexElementMap;
    for (var k in vertexElementMap) {
      delete vertexElementMap[k];
    }
  }

  private _addVertexElement(element: VertexElement): void {
    this._vertexElementMap[element.semantic] = element;
    this._vertexElements.push(element);
  }

  private _setVertexBufferBinding(index: number, buffer: VertexBufferBinding): void {
    const originBufferBinding = this._vertexBufferBindings[index];
    if (originBufferBinding) {
      this._removeRefChild(originBufferBinding._buffer);
    }
    this._addRefChild(buffer._buffer);
    // @ts-ignore
    this._vertexBufferBindings[index] = buffer;
  }
}
