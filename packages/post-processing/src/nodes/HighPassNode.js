import { DataType } from '@alipay/o3-core';
import { PostEffectNode } from '../PostEffectNode';

import HighPassShader from '../shaders/HighPass.glsl';

const SHADER_CONFIG = {
  source:HighPassShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    s_threshold:{
      name:'s_threshold',
      type:DataType.FLOAT
    },
    s_smoothWidth:{
      name:'s_smoothWidth',
      type:DataType.FLOAT
    }
  }
};

/**
 * 将画面中亮度高于指定范围的像素提取出来（其他像素置为黑色）
 */
export class HighPassNode extends PostEffectNode {

  constructor( name, renderTarget, parent ){

    super( name, renderTarget, parent, SHADER_CONFIG );

    this._threshold = 0.75;
    this._smoothWidth = 0.2;

    this.material.setValue( 's_threshold', this._threshold );
    this.material.setValue( 's_smoothWidth', this._smoothWidth );

  }

  /**
   * 亮度阈值
   */
  get threshold(){

    return this._threshold;

  }

  set threshold( value ){

    this._threshold = value;
    this.material.setValue( 's_threshold', this._threshold );

  }

  /**
   * 亮度的插值范围
   */
  get smoothWidth() {

    return this._smoothWidth;

  }

  set smoothWidth( value ) {

    this._smoothWidth = value;
    this.material.setValue( 's_smoothWidth', this._smoothWidth );

  }

};
