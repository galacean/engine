import { DataType, TextureWrapMode } from '@alipay/o3-core';
import { PostEffectNode } from './PostEffectNode';
import VignetteShader from './shaders/Vignette.glsl';


/**
 * shader配置
 * @private
 */
const SHADER_CONFIG = {
  source:VignetteShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    u_aspect:{
      name:'u_aspect',
      type:DataType.FLOAT
    },
    u_coloredNoise:{
      name:'u_coloredNoise',
      type:DataType.FLOAT
    },
    u_smoothing:{
      name:'u_smoothing',
      type:DataType.FLOAT_VEC2
    },
    u_noiseAlpha:{
      name:'u_noiseAlpha',
      type:DataType.FLOAT
    },
    u_color:{
      name:'u_color',
      type:DataType.FLOAT_VEC3
    }
  }
};

/**
 * 相机暗角效果
 * @private
 */
export class VignetteEffect extends PostEffectNode{

  constructor( manager, props ){

    const rtPool = manager.renderTargets;

    let renderTarget = {};
    if( props && props.rtSize ) {

      const rtColor = [ 0.0, 0.0, 0.0, 1.0 ];

      renderTarget = rtPool.require( 'scene_renderTarget', {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: rtColor
      } );

    } else {

      const rtSize = 1024;
      renderTarget = rtPool.require( 'scene_' + rtSize );

    }

    super( 'Vignette', renderTarget, null, SHADER_CONFIG );

    const mtl = this.material;

    mtl.setValue( 'u_aspect', renderTarget.width / renderTarget.height );

    mtl.setValue( 'u_coloredNoise', -1.0 );
    mtl.setValue( 'u_smoothing', [ -0.5, 1.0 ] );
    this._smoothing = [ -0.5, 1.0 ];
    mtl.setValue( 'u_noiseAlpha', 0.35 );

    mtl.setValue( 'u_color', [ 0.0, 0.0, 0.0 ] );
    this._color = [ 0.0, 0.0, 0.0 ];

  }

  /**
   * 相机暗角颜色
   */
  get color(){

    return this._color;

  }

  set color( value ){

    this._color = value;
    if( this._color ){

      this.material.setValue( 'u_color', this._color );

    }

  }

  get colorR(){

    return this._color[0];

  }

  set colorR( value ){

    this._color[0] = value;
    if( this._color ){

      this.material.setValue( 'u_color', this._color );

    }

  }

  get colorG(){

    return this._color[1];

  }

  set colorG( value ){

    this._color[1] = value;
    if( this._color ){

      this.material.setValue( 'u_color', this._color );

    }

  }

  get colorB(){

    return this._color[2];

  }

  set colorB( value ){

    this._color[2] = value;
    if( this._color ){

      this.material.setValue( 'u_color', this._color );

    }

  }

  /**
   * 暗角外层范围控制
   */
  get smoothingX(){

    return this._smoothing[0];

  }

  set smoothingX( value ){

    this._smoothing[0] = value;
    if( this._smoothing ){

      this.material.setValue( 'u_smoothing', this._smoothing );

    }

  }

  /**
   * 暗角内层范围控制
   */
  get smoothingY(){

    return this._smoothing[1];

  }

  set smoothingY( value ){

    this._smoothing[1] = value;
    if( this._smoothing ){

      this.material.setValue( 'u_smoothing', this._smoothing );

    }

  }

}
