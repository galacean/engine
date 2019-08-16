import { SceneFeature } from '@alipay/r3-core';
import { Logger } from '@alipay/r3-base';

/**
 * 判断场景中是否有灯光
 * @returns {boolean}
 * @private
 */
export function hasLight() {

  return this.findFeature( LightFeature ).visibleLights.length > 0;

}

/**
 * 将灯光数据绑定到指定的材质中（指定Unifrom的值）
 * @param {Material} mtl 材质对象
 * @private
 */
export function bindLightsToMaterial( mtl ) {

  var lights = this.findFeature( LightFeature ).visibleLights;
  for ( var i = 0, l = lights.length; i < l; i++ ) {

    lights[i].bindMaterialValues( mtl );

  }

}

/**
 * Scene Feature：在场景中添加灯光特性
 * @extends SceneFeature
 * @private
*/
export class LightFeature extends SceneFeature {

  private visibleLights;
  constructor() {

    super();
    this.visibleLights = [];

  }

  /**
   * 向当前场景注册一个灯光对象
   * @param {LightComponent} light 灯光对象
   * @private
   */
  attachRenderLight( light ) {

    const index = this.visibleLights.indexOf( light );
    if ( index == -1 ) {

      this.visibleLights.push( light );

    } else {

      Logger.warn( 'Light already attached.' );

    }

  }

  /**
   * 从当前场景移除一个灯光对象
   * @param {LightComponent} light 灯光对象
   * @private
   */
  detachRenderLight( light ) {

    const index = this.visibleLights.indexOf( light );
    if ( index != -1 ) {

      this.visibleLights.splice( index, 1 );

    }

  }

}
