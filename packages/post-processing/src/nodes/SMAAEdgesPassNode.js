import { DataType } from '@alipay/o3-core';
import { PostEffectNode } from '../PostEffectNode';

import SMAAEdgesShader from '../shaders/SMAAEdgesPass.glsl';

const SHADER_CONFIG = {
  source: SMAAEdgesShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D
    },
    u_resolution: {
      name: 'u_resolution',
      type: DataType.FLOAT_VEC2,
    }
  }
};

/**
 * 边缘检测
 */
export class SMAAEdgesPassNode extends PostEffectNode {

  constructor( name, renderTarget, parent, resolution ) {

    super( name, renderTarget, parent, SHADER_CONFIG );

    this.material.setValue( 'u_resolution', resolution );

  }

  set resolution( v ) {

    this.material.setValue( 'u_resolution', v );

  }

};

