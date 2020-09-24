import { AssetObject } from "../asset/AssetObject";
import { PrimitiveTopology } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { PrimitiveGroup } from "../graphic/PrimitiveGroup";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { Primitive } from "../graphic/Primitive";
import { BoundingBox } from "../RenderableComponent";

/**
 * 缓冲几何体。
 */
export class BufferGeometry extends AssetObject {
  private static _geometryCount = 0;

  _primitive: Primitive;

  private _bounds: BoundingBox;
  private _groups: PrimitiveGroup[] = [];

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
  get instanceCount(): number {
    return this._primitive.instanceCount;
  }

  set instanceCount(count: number) {
    this._primitive.instanceCount = count;
  }

  /**
   * 首个几何体组,使用第一个材质渲染,设置多个几何体组详见 groups 属性。
   */
  get group(): PrimitiveGroup | null {
    return this._groups[0] || null;
  }

  /**
   * 几何体组集合,每组可以使用独立的材质渲染。
   */
  get groups(): Readonly<PrimitiveGroup[]> {
    return this._groups;
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
    this._primitive.setIndexBufferBinding(<Buffer>bufferOrBinding, format);
  }

  /**
   * 设置顶点元素集合。
   * @param elements - 顶点元素集合。
   */
  setVertexElements(elements: VertexElement[]): void {
    this._primitive.setVertexElements(elements);
  }

  /**
   * 添加几何体组。
   * @param offset - 索引缓冲的偏移
   * @param count - 索引缓冲的数量
   * @param topology - 图元拓扑
   */
  addGroup(offset: number, count: number, topology: PrimitiveTopology = PrimitiveTopology.Triangles): PrimitiveGroup {
    const drawGroup = new PrimitiveGroup();
    drawGroup.offset = offset;
    drawGroup.count = count;
    drawGroup.topology = topology;
    this._groups.push(drawGroup);
    return drawGroup;
  }

  /**
   * 移除几何体组。
   * @param drawGroup - 几何体组
   */
  removeGroup(drawGroup: PrimitiveGroup): void {
    const drawGroups = this._groups;
    const index = drawGroups.indexOf(drawGroup);
    if (index !== -1) {
      drawGroups.splice(index, 1);
    }
  }

  /**
   * 清空几何体组。
   */
  clearGroup(): void {
    this._groups.length = 0;
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
