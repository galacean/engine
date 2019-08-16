import { AFog } from './AFog';

/**
 * 指数雾
 * @extends AFog
 */
export class AEXP2Fog extends AFog {

  public density;
  /**
   * 指数变换的雾
   * @param {*} node 节点
   * @param {Object} [props] 包含以下参数
   * @param {Array} [props.color=[1, 1, 1]] 雾颜色
   * @param {Number} [props.density=0.0025] 雾的浓度（0-1）
   */
  constructor( node, props ) {

    super( node, props );

    /**
     * 浓度
     * @member {Number}
     */
    this.density = props.density === undefined ? 0.0025 : props.density;

  }

  /**
   * @private
   */
  bindMaterialValues( mtl ){

    mtl.setValue( 'u_fogColor', this.color );
    mtl.setValue( 'u_fogDensity', this.density );

  }

}
