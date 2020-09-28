import { PrimitiveTopology } from "./enums/PrimitiveTopology";

/**
 * 图元组。
 */
export class PrimitiveGroup {
  /** 起始绘制偏移。*/
  start: number;
  /** 绘制数量。*/
  count: number;
  /** 图元拓扑。*/
  topology: PrimitiveTopology;

  /**
   * 创建图元组。
   * @param start - 起始绘制偏移
   * @param count - 数量
   * @param topology - 图元拓扑
   */
  constructor(start: number = 0, count: number = 0, topology: PrimitiveTopology = PrimitiveTopology.Triangles) {
    this.start = start;
    this.count = count;
    this.topology = topology;
  }
}
