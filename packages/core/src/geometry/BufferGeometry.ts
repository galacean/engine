import { AssetObject } from "../asset/AssetObject";
import { Buffer } from "../graphic/Buffer";
import { DrawGroup } from "../graphic/DrawGroup";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { PrimitiveTopology } from "../graphic/enums/PrimitiveTopology";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { Primitive } from "../primitive/Primitive";
import { BoundingBox } from "../RenderableComponent";

/**
 * 缓冲几何体。
 */
export class BufferGeometry extends AssetObject {
  private static _geometryCount = 0;

  _primitive: Primitive;

  private _bounds: BoundingBox;
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
   * 索引缓冲绑定信息。
   */
  get indexBufferBinding(): IndexBufferBinding {
    return this._primitive.indexBufferBinding;
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
   * 第一个绘制组。
   */
  get drawGroup(): DrawGroup | null {
    return this._drawGroups[0] || null;
  }

  /**
   * 绘制组数量。
   */
  get drawGroupCount(): number {
    return this._drawGroups.length;
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
    this._drawGroups.push(new DrawGroup());
  }

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBinding - 顶点缓冲绑定
   */
  setVertexBufferBindings(vertexBufferBinding: VertexBufferBinding): void;

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBinding - 顶点缓冲绑定
   * @param index - 顶点缓冲索引
   */
  setVertexBufferBindings(vertexBufferBinding: VertexBufferBinding, index: number): void;

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBindings - 顶点缓冲绑定
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[]): void;

  /**
   * 设置顶点缓冲。
   * @param vertexBufferBindings - 顶点缓冲绑定
   * @param firstIndex - 第一个顶点缓冲索引
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number): void;

  setVertexBufferBindings(
    vertexBufferBindings: VertexBufferBinding | VertexBufferBinding[],
    firstIndex: number = 0
  ): void {
    this._primitive.setVertexBufferBindings(vertexBufferBindings, firstIndex);
  }

  /**
   * 设置索引缓冲。
   * @param buffer - 索引缓冲
   * @param format - 索引缓冲格式
   */
  setIndexBufferBinding(buffer: Buffer, format: IndexFormat): void {
    this._primitive.setIndexBufferBinding(buffer, format);
  }

  /**
   * 添加顶点元素集合。
   * @param elements - 顶点元素集合。
   */
  addVertexElements(elements: VertexElement | VertexElement[]): void {
    this._primitive.addVertexElements(elements);
  }

  /**
   * 添加绘制组。
   * @param offset - 偏移
   * @param count - 数量
   */
  addDrawGroup(offset: number, count: number): DrawGroup {
    const drawGroup = new DrawGroup();
    drawGroup.offset = offset;
    drawGroup.count = count;
    this._drawGroups.push(drawGroup);
    return drawGroup;
  }

  /**
   * 移除绘制组。
   * @param drawGroup -绘制组。
   */
  removeDrawGroup(drawGroup: DrawGroup): void {
    const drawGroups = this._drawGroups;
    const index = drawGroups.indexOf(drawGroup);
    if (index !== -1) {
      drawGroups.splice(index, 1);
    }
  }

  /**
   * 清空绘制组。
   */
  clearDrawGroup(): void {
    this._drawGroups.length = 0;
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
}
