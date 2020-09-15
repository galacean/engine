import { Vector3 } from "@alipay/o3-math";
import { ReferenceObject } from "../asset/ReferenceObject";
import { Primitive } from "../primitive/Primitive";

/**
 * Mesh Asset Object
 */
export class Mesh extends ReferenceObject {
  public primitives: Primitive[];
  public weights: number[];
  public readonly bounds: any = { min: new Vector3(), max: new Vector3() };

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name?: string) {
    super();
    this.primitives = [];
    this._gcPriority = 1000;
  }

  updatePrimitiveWeightsIndices(weightsIndices: number[]) {
    // this.primitives.forEach((primitive) => {
    //   primitive.updateWeightsIndices(weightsIndices);
    // });
  }

  onDestroy() {
    const primitives = this.primitives;
    for (let i = 0, len = primitives.length; i < len; i++) {
      // TODO: 修改为最新的销毁，销毁实现删除 VAO、VB、IB
      primitives[i].destroy();
    }
  }
}
