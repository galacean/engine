import { VertexElement } from "./vertexElement";

/**
 * 顶点声明，描述 VertexBuffer 的顶点声明结构。
 */
export class VertexDeclaration {
  private _vertexStride: number;
  private _elements: VertexElement[];

  /**
   * 顶点跨度。
   */
  get vertexStride(): number {
    return this._vertexStride;
  }

  /**
   * 顶点元素集合。
   */
  get elements(): Readonly<VertexElement[]> {
    return this._elements;
  }

  /**
   * 构造顶点声明。
   * @param vertexStride - 顶点跨度。
   * @param elements - 顶点元素集合。
   */
  constructor(vertexStride: number, elements: VertexElement[]) {
    this._vertexStride = vertexStride;
    this._elements = elements;
  }
}
