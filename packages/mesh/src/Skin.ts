import { AssetObject } from "@alipay/o3-core";

let skinID = 0;

/**
 * mesh skin data, equal glTF skins define
 * @class
 */
export class Skin extends AssetObject {
  public inverseBindMatrices;
  public joints;
  public skeleton;
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
