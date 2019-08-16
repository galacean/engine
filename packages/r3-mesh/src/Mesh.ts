import {AssetObject} from '@alipay/r3-core';

let meshID = 0;

/**
 * Mesh Asset Object
 * @class
 */
export class Mesh extends AssetObject {

  public primitives;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor(name) {

    super(name || 'DEFAULT_MESH_NAME_' + meshID++);

    /** @member {Array} */
    this.primitives = []; // Primitive array

  }

}
