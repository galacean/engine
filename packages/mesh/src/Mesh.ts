import { ReferenceObject } from "@alipay/o3-core";
import { Primitive } from "@alipay/o3-primitive";

/**
 * Mesh Asset Object
 * @class
 */
export class Mesh extends ReferenceObject {
  public primitives: Primitive[];
  public weights: number[];

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name?: string) {
    super();

    /** @member {Array} */
    this.primitives = []; // Primitive array
  }

  updatePrimitiveWeightsIndices(weightsIndices: number[]) {
    this.primitives.forEach((primitive) => {
      primitive.updateWeightsIndices(weightsIndices);
    });
  }

  onDestroy() {
    const primitives = this.primitives;
    for (let i = 0, len = primitives.length; i < len; i++) {
      // TODO: 修改为最新的销毁，销毁实现删除 VAO、VB、IB
      primitives[i].finalize();
    }
  }
}
