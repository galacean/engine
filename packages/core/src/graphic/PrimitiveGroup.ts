import { PrimitiveTopology } from "./enums/PrimitiveTopology";

/**
 * 图元组。
 */
export class PrimitiveGroup {
  /** 偏移。*/
  offset: number;
  /** 数量。*/
  count: number;
  /** 图元拓扑。*/
  topology: PrimitiveTopology;

  /**
   * 创建图元组。
   * @param offset - 偏移
   * @param count - 数量
   * @param topology - 图元拓扑
   */
  constructor(offset: number = 0, count: number = 0, topology: PrimitiveTopology = PrimitiveTopology.Triangles) {
    this.offset = offset;
    this.count = count;
    this.topology = topology;
  }
}
