import { DataType } from '@alipay/o3-core';
import { Vector2 } from '@alipay/o3-math';
import { PostEffectNode } from '../PostEffectNode';

import GodraysStartShader from '../shaders/GodraysStartPass.glsl';

const SHADER_CONFIG = {
  source:GodraysStartShader,
  uniforms : {
    s_depthTexture: {
      name: 's_depthTexture',
      type: DataType.SAMPLER_2D
    },
    u_sunScreen: {
      name: 'u_sunScreen',
      type: DataType.FLOAT_VEC2,
    },
    u_stepSize: {
      name: 'u_stepSize',
      type: DataType.FLOAT,
    }
  }
};

/**
 * 将深度纹理处理得到第一次阴影迭代
 */
export class GodraysStartPassNode extends PostEffectNode {

  constructor( name, renderTarget, parent ){

    super( name, renderTarget, parent, SHADER_CONFIG );

    this._sunScreen = new Vector2(1.0, 1.0);
    this.material.setValue( 'u_sunScreen', this._sunScreen );

  }
  /**
   * 场景深度 贴图
   */
  get depthTexture(){

    return this._depthTexture;

  }

  set depthTexture( value ){

    this._depthTexture = value;
    this.material.setValue( 's_depthTexture', this._depthTexture );

  }

  /**
   * 太阳空间坐标
   */
  get sunScreen(){

    return this._sunScreen;

  }

  set sunScreen( value ){

    this._sunScreen = value;
    this.material.setValue( 'u_sunScreen', this._sunScreen );

  }

  /**
   * 体积光迭代密度
   */
  get fStepSize(){

    return this._fStepSize;

  }

  set fStepSize( value ){

    this._fStepSize = value;
    this.material.setValue( 'u_stepSize', this._fStepSize );

  }

};

