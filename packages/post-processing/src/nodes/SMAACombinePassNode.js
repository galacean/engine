import { DataType } from '@alipay/o3-base';
import { PostEffectNode } from '../PostEffectNode';

import SMAACombineShader from '../shaders/SMAACombinePass.glsl';

const SHADER_CONFIG = {
  source: SMAACombineShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D
    },
    u_resolution: {
      name: 'u_resolution',
      type: DataType.FLOAT_VEC2,
    },
    s_Color: {
      name: 's_Color',
      type: DataType.SAMPLER_2D
    }
  }
};

/**
 * 混合周围像素
 */
export class SMAACombinePassNode extends PostEffectNode {

  constructor( name, renderTarget, parent, sourceColor, resolution ){

    super( name, renderTarget, parent, SHADER_CONFIG );

    this.material.setValue( 'u_resolution', resolution );

    this.material.setValue( 's_Color', sourceColor );

  }

  set resolution( v ) {

    this.material.setValue( 'u_resolution', v );

  }

  set sourceColor( v ) {

    this.material.setValue( 's_Color', v );

  }

};
