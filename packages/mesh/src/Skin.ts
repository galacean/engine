import { AssetObject } from "@alipay/o3-core";
import { Matrix4x4 } from "@alipay/o3-math";

let skinID = 0;

/**
 * mesh skin data, equal glTF skins define
 * @class
 */
export class Skin extends AssetObject {
  public inverseBindMatrices: Matrix4x4[]; // TODO chengkong.zxx
  public joints: string[];
  public skeleton: string;
  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name) {
    super(name || "DEFAULT_SKIN_NAME_" + skinID++);

    this.inverseBindMatrices = []; // inverse bind matrix array, element type: gl-matrix.mat4
    this.joints = []; // joints name array, element type: string
    this.skeleton = "none"; // root bone name
  }
}
