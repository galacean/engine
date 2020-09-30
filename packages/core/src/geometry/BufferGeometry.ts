import { SubGeometry, GeometryTopology } from "..";
import { AssetObject } from "../asset/AssetObject";
import { Buffer } from "../graphic/Buffer";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { Primitive } from "../graphic/Primitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BoundingBox } from "../RenderableComponent";

/**
 * 缓冲几何体。
 */
export class BufferGeometry extends AssetObject {
  _primitive: Primitive = new Primitive();

  private _bounds: BoundingBox;
  private _subGroups: SubGeometry[] = [];

  /**
   * 顶点缓冲绑定信息集合。
   */
  get vertexBufferBindings(): Readonly<VertexBufferBinding[]> {
    return this._primitive.vertexBufferBindings;
  }

  /**
   * 索引缓冲绑定信息。
   */
  get indexBufferBinding(): IndexBufferBinding {
    return this._primitive.indexBufferBinding;
  }

  /**
   * 顶点元素集合。
   */
  get vertexElements(): Readonly<VertexElement[]> {
    return this._primitive.vertexElements;
  }

  /**
   * 首个几何体组,使用第一个材质渲染,设置多个几何体组详见 groups 属性。
   */
  get group(): SubGeometry | null {
    return this._subGroups[0] || null;
  }

  /**
   * 几何体组集合,每组可以使用独立的材质渲染。
   */
  get groups(): Readonly<SubGeometry[]> {
    return this._subGroups;
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
    this.name = name;
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
   * 添加几何体组，每一组可分别对应独立的材质。
   * @param start - 起始绘制偏移，如果设置了索引缓冲则表示在索引缓冲的偏移，如果没有设置则表示在顶点缓冲中的偏移
   * @param count - 绘制数量，如果设置了索引缓冲则表示在索引缓冲的数量，如果没有设置则表示在顶点缓冲中的数量
   * @param topology - 几何体拓扑
   */
  addSubGeometry(start: number, count: number, topology: GeometryTopology = GeometryTopology.Triangles): SubGeometry {
    const drawGroup = new SubGeometry(start, count, topology);
    this._subGroups.push(drawGroup);
    return drawGroup;
  }

  /**
   * 移除子几何体。
   * @param subGeometry - 子几何体
   */
  removeSubGeometry(subGeometry: SubGeometry): void {
    const drawGroups = this._subGroups;
    const index = drawGroups.indexOf(subGeometry);
    if (index !== -1) {
      drawGroups.splice(index, 1);
    }
  }

  /**
   * 清空几何体组。
   */
  clearSubGeometry(): void {
    this._subGroups.length = 0;
  }

  /**
   * 销毁。
   */
  destroy(): void {
    if (this._primitive) {
      this._primitive.destroy();
      this._primitive = null;
    }
  }
}
