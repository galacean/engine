import { AssetObject } from "../asset/AssetObject";
import { Primitive } from "../primitive/Primitive";
import { VertexBufferBinding } from "./graphic/VertexBufferBinding";
import { VertexElements } from "./graphic/VertexElement";
import { IndexBuffer } from "./index";

let geometryCount = 0;

/**
 * 缓冲几何体。
 */
export class BufferGeometry extends AssetObject {
  primitive: Primitive;

  private _bufferCount: number;
  private _bounds: any;

  /**
   * 包围体。
   */
  get bounds(): any {
    return this._bounds;
  }

  set bounds(value: any) {
    this._bounds = value;
  }

  /**
   * 顶点数量。
   */
  get vertexCount(): number {
    return this.primitive.vertexCount;
  }

  set vertexCount(value: number) {
    this.primitive.vertexCount = value;
  }

  /**
   * 实例数量。
   */
  get instancedCount(): number {
    return this.primitive.instancedCount;
  }

  set instancedCount(count: number) {
    this.primitive.instancedCount = count;
  }

  /**
   * 绘制模式。
   */
  set mode(mode) {
    this.primitive.mode = mode;
  }

  get mode() {
    return this.primitive.mode;
  }

  get attributes(): VertexElements {
    return this.primitive.attributes;
  }

  /**
   * 索引缓冲。
   */
  get indexBuffer(): IndexBuffer {
    return this.primitive.indexBuffer;
  }

  /**
   * 索引数量。
   */
  set indexCount(v: number) {
    this.primitive.indexCount = v;
  }

  get indexCount(): number {
    return this.primitive.indexCount;
  }

  /**
   * @param name - 名称
   */
  constructor(name?: string) {
    super();
    name = name || "bufferGeometry" + geometryCount++;
    this._bufferCount = 0;
    this.primitive = new Primitive();
  }

  /**
   * 添加一个顶点缓冲。
   * @param vertexBuffer - 顶点缓冲
   */
  addVertexBuffer(vertexBuffer: VertexBufferBinding): void {
    this.primitive.addVertexBuffer(vertexBuffer);
    this._bufferCount++;
  }

  /**
   * 添加一个索引缓冲。
   * @param indexBuffer - 索引缓冲
   */
  setIndexBuffer(indexBuffer: IndexBuffer): void {
    this.primitive.indexBuffer = indexBuffer;
  }

  /**
   * 释放内部资源对象。
   */
  destroy(): void {
    if (this.primitive) {
      this.primitive.destroy();
      this.primitive = null;
    }
  }

  reset(): void {
    this.primitive.reset();
    this._bufferCount = 0;
  }

  _render(): void {}
}
