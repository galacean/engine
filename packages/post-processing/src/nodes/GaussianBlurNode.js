import { DataType } from '@alipay/o3-base';
import { PostEffectNode } from '../PostEffectNode';

import GaussianBlurShader from '../shaders/GaussianBlur.glsl';


/**
 * 将父节点的沿着指定方向进行模糊
 */
export class GaussianBlurNode extends PostEffectNode {

  constructor( name, renderTarget, parent, filterSize ){

    super( name, renderTarget, parent, makeShaderConfig( filterSize ) );

    const rtSize = renderTarget.width;

    this.material.setValue( 'u_texelSize',  1.0 / rtSize );

    this._direction = [ 0.5, 0.0 ] ;
    this.material.setValue( 'u_direction', this._direction );

  }

  /**
   * 模糊运算的采样方向
   */
  get direction(){

    return this._direction;

  }

  set direction( value ){

    this._direction = value;
    this.material.setValue( 'u_direction', this._direction );

  }

};

function makeShaderConfig( filterSize ){

  return {
    source:GaussianBlurShader,
    uniforms : {
      s_sourceRT: {
        name: 's_sourceRT',
        type: DataType.SAMPLER_2D,
      },
      u_texelSize:{
        name:'u_texelSize',
        type:DataType.FLOAT
      },
      u_direction:{
        name:'u_direction',
        type:DataType.FLOAT_VEC2
      }
    },
    macros:{
      FILTER_SIZE:filterSize
    }
  };

}
