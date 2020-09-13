import { AssetObject } from "../asset/AssetObject";
import { Primitive } from "../primitive/Primitive";
import { DrawGroup } from "./graphic/DrawGroup";
import { PrimitiveTopology } from "./graphic/enums/PrimitiveTopology";
import { VertexBufferBinding } from "./graphic/VertexBufferBinding";
import { VertexElement } from "./graphic/VertexElement";
import { IndexBuffer } from "./index";

/**
 * 缓冲几何体。
 */
export class BufferGeometry extends AssetObject {
  private static _geometryCount = 0;

  _primitive: Primitive;

  private _bounds: any;
  private _drawGroups: DrawGroup[] = [];

  /**
   * 顶点缓冲绑定信息集合。
   */
  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._primitive.vertexBufferBindings;
  }

  /**
   * 顶点元素集合。
   */
  get vertexElements(): Readonly<VertexElement[]> {
    return this._primitive.vertexElements;
  }

  /**
   * 索引缓冲。
   */
  get indexBuffer(): IndexBuffer {
    return this._primitive.indexBuffer;
  }

  set indexBuffer(indexBuffer: IndexBuffer) {
    this._primitive.indexBuffer = indexBuffer;
  }

  /**
   * 实例数量,0 表示关闭。
   */
  get instancedCount(): number {
    return this._primitive.instanceCount;
  }

  set instancedCount(count: number) {
    this._primitive.instanceCount = count;
  }

  /**
   * 绘制基元拓扑模式。
   */
  set primitiveTopology(topology: PrimitiveTopology) {
    this._primitive.primitiveTopology = topology;
  }

  get primitiveTopology(): PrimitiveTopology {
    return this._primitive.primitiveTopology;
  }

  /**
   * 绘制组集合。
   */
  get drawGroups(): Readonly<DrawGroup[]> {
    return this._drawGroups;
  }

  /**
   * 绘制组。
   */
  get drawGroup(): DrawGroup {
    return this._drawGroups[0];
  }

  /**
   * 绘制组数量。
   */
  get drawGroupCount(): number {
    return this._drawGroups.length;
  }

  set drawGroupCount(value: number) {
    if (value < 1) {
      throw "drawGroupCount must large than 1.";
    }
    const drawGroups = this._drawGroups;
    const curCount = drawGroups.length;
    drawGroups.length = value;
    if (curCount < value) {
      for (let i = curCount; i < value; i++) {
        drawGroups[i] = new DrawGroup();
      }
    }
  }

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
   * 创建几何体缓冲。
   * @param name - 名称
   */
  constructor(name?: string) {
    super();
    name = name || "BufferGeometry" + BufferGeometry._geometryCount++;
    this._primitive = new Primitive();
    this.drawGroupCount = 1;
  }

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBinding - 顶点缓冲绑定
   */
  setVertexBuffers(vertexBufferBinding: VertexBufferBinding): void;

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBinding - 顶点缓冲绑定
   * @param index - 顶点缓冲索引
   */
  setVertexBuffers(vertexBufferBinding: VertexBufferBinding, index: number): void;

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBindings - 顶点缓冲绑定
   */
  setVertexBuffers(vertexBufferBindings: VertexBufferBinding[]): void;

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBindings - 顶点缓冲绑定
   * @param firstIndex - 第一个顶点缓冲索引
   */
  setVertexBuffers(vertexBufferBindings: VertexBufferBinding[], firstIndex: number): void;

  setVertexBuffers(vertexBufferBindings: VertexBufferBinding | VertexBufferBinding[], firstIndex: number = 0): void {
    this._primitive.setVertexBuffers(vertexBufferBindings, firstIndex);
  }

  /**
   * 添加顶点元素集合。
   * @param elements - 顶点元素集合。
   */
  addVertexElements(elements: VertexElement | VertexElement[]): void {
    this._primitive.addVertexElements(elements);
  }

  /**
   * 释放内部资源对象。
   */
  destroy(): void {
    if (this._primitive) {
      this._primitive.destroy();
      this._primitive = null;
    }
  }

  /**
   * @internal
   */
  _render(): void {}

  /**
   * @deprecated
   */
  reset(): void {
    this._primitive.reset();
  }
}
