import { vec3 } from '@alipay/o3-math';
import { ALight } from './ALight';

/**
 * 环境光创建类
 * @extends ALight
 */
export class AAmbientLight extends ALight {

  private _lightCache;
  public color;
  public intensity;
  /**
   * @constructor
   * @param {Node} node 节点对象
   * @param {Object} props 参数对象
   * @param {string} [props.name = ambientLight] props.name 名称
   * @param {Vec3} [props.color = vec3.fromValues(1, 1, 1)] 颜色
   * @param {number} [props.intensity = 1] 光照强度
   */
  constructor( node, props ) {

    super( node );
    this.name = props.name || 'ambientLight';

    /**
     * 颜色
     * @member {Vec3}
     */
    this.color = props.color || vec3.fromValues( 1, 1, 1 );

    /**
     * 光照强度
     * @member {number}
     */
    this.intensity = props.intensity || 1.0;

    this._lightCache = vec3.create();

  }

  /**
   * 将灯光参数值提交到材质对象
   */
  bindMaterialValues( mtl, uniformName ) {

    vec3.scale( this._lightCache, this.color, this.intensity );
    mtl.setValue( uniformName, this._lightCache );

  }

}
