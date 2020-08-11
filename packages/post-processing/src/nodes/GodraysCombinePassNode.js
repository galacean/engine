import { DataType } from '@alipay/o3-core';
import { Vector3 } from '@alipay/o3-math';
import { PostEffectNode } from '../PostEffectNode';

import GodraysCombineShader from '../shaders/GodraysCombinePass.glsl';

const SHADER_CONFIG = {
  source:GodraysCombineShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D
    },
    s_godRays: {
      name: 's_godRays',
      type: DataType.SAMPLER_2D
    },
    u_sunScreen: {
      name: 'u_sunScreen',
      type: DataType.FLOAT_VEC2,
    },
    u_godRayIntensity: {
      name: 'u_godRayIntensity',
      type: DataType.FLOAT
    },
    u_godRayLong: {
      name: 'u_godRayLong',
      type: DataType.FLOAT
    },
    u_color: {
      name: 'u_color',
      type: DataType.FLOAT_VEC3
    },
  }
};

/**
 * 将sourceRT与体积光的rendertarget进行处理叠加显示
 */
export class GodraysCombinePassNode extends PostEffectNode {

  constructor( name, renderTarget, parent, godRays ){

    super( name, renderTarget, parent, SHADER_CONFIG );

    this.material.setValue( 's_godRays', godRays );

    this._sunScreen = [1.0, 1.0];
    this.material.setValue( 'u_sunScreen', this._sunScreen );

    this._godRayIntensity = 0.69;
    this.material.setValue( 'u_godRayIntensity', this._godRayIntensity );

    this._godRayLong = 1.0;
    this.material.setValue( 'u_godRayLong', this._godRayLong );

    this._color = new Vector3(1.0, 1.0, 1.0);
    this.material.setValue( 'u_color', this._color );

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
   * 体积光光强
   */
  get godRayIntensity(){

    return this._godRayIntensity;

  }

  set godRayIntensity( value ){

    this._godRayIntensity = value;
    this.material.setValue( 'u_godRayIntensity', this._godRayIntensity );

  }

  /**
   * 体积光范围
   */
  get godRayLong(){

    return this._godRayLong;

  }

  set godRayLong( value ){

    this._godRayLong = value;
    this.material.setValue( 'u_godRayLong', this._godRayLong );

  }

  /**
   * 体积光颜色
   */
  get color(){

    return this._color;

  }

  set color( value ){

    this._color = value;
    this.material.setValue( 'u_color', this._color );

  }

};
