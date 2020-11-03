import { BoundingBox } from "@oasis-engine/math";
import { EngineObject } from "../base";
import { Engine } from "../Engine";
import { PrimitiveTopology, SubPrimitive } from "../graphic";
import { Buffer } from "../graphic/Buffer";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { Primitive } from "../graphic/Primitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";

/**
 * 缓冲几何体。
 */
export class BufferGeometry extends EngineObject {
  /** 名称。*/
  name: string;

  /** @internal */
  _primitive: Primitive;

  private _bounds: BoundingBox;
  private _subGeometries: SubPrimitive[] = [];

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
   * 首个子几何体,使用第一个材质渲染,设置多个几何体组详见 subGeometrys 属性。
   */
  get subGeometry(): SubPrimitive | null {
    return this._subGeometries[0] || null;
  }

  /**
   * 子几何体集合,每个子几何体可以使用独立的材质渲染。
   */
  get subGeometries(): Readonly<SubPrimitive[]> {
    return this._subGeometries;
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
   * @param engine - 所属引擎
   * @param name - 名称
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this._primitive = new Primitive(engine);
    this.name = name;
  }

  /**
   * 设置顶点缓冲绑定。
   * @param vertexBufferBindings - 顶点缓冲绑定
   * @param firstIndex - 第一个顶点缓冲索引，默认值为 0
   */
  setVertexBufferBinding(vertexBufferBindings: VertexBufferBinding, firstIndex?: number): void;

  /**
   * 设置顶点缓冲绑定。
   * @param vertexBuffer - 顶点缓冲
   * @param stride - 顶点缓冲跨度
   * @param firstIndex - 第一个顶点缓冲索引，默认值为 0
   */
  setVertexBufferBinding(vertexBuffer: Buffer, stride: number, firstIndex?: number): void;

  setVertexBufferBinding(
    bufferOrBinding: Buffer | VertexBufferBinding,
    stride: number = 0,
    firstIndex: number = 0
  ): void {
    this._primitive.setVertexBufferBinding(<Buffer>bufferOrBinding, stride, firstIndex);
  }

  /**
   * 设置顶点缓冲集合。
   * @param vertexBufferBindings - 顶点缓冲绑定集合
   * @param firstIndex - 第一个顶点缓冲索引,默认值为 0
   */
  setVertexBufferBindings(vertexBufferBindings: VertexBufferBinding[], firstIndex: number = 0): void {
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
   * 添加子几何体，每一个子几何体可对应独立的材质。
   * @param start - 起始绘制偏移，如果设置了索引缓冲则表示在索引缓冲的偏移，如果没有设置则表示在顶点缓冲中的偏移
   * @param count - 绘制数量，如果设置了索引缓冲则表示在索引缓冲的数量，如果没有设置则表示在顶点缓冲中的数量
   * @param topology - 几何体拓扑，默认值是 PrimitiveTopology.Triangles
   */
  addSubGeometry(
    start: number,
    count: number,
    topology: PrimitiveTopology = PrimitiveTopology.Triangles
  ): SubPrimitive {
    const subGeometry = new SubPrimitive(start, count, topology);
    this._subGeometries.push(subGeometry);
    return subGeometry;
  }

  /**
   * 移除子几何体。
   * @param subGeometry - 子几何体
   */
  removeSubGeometry(subGeometry: SubPrimitive): void {
    const subGeometries = this._subGeometries;
    const index = subGeometries.indexOf(subGeometry);
    if (index !== -1) {
      subGeometries.splice(index, 1);
    }
  }

  /**
   * 清空子几何体。
   */
  clearSubGeometry(): void {
    this._subGeometries.length = 0;
  }

  onDestroy() {
    if (this._primitive) {
      this._primitive.destroy();
      this._primitive = null;
    }
  }
}
