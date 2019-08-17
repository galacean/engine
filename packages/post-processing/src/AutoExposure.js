import { DataType, TextureWrapMode } from '@alipay/o3-base';
import { PostEffectNode } from './PostEffectNode';

/**
 * shader代码
 * @private
 */
const AutoExposureShader = `
precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform float u_LAvg;
uniform float u_KeyValue;

void main(){
  vec4 srcColor = texture2D(s_sourceRT, v_uv);
  gl_FragColor = srcColor * u_KeyValue/u_LAvg;

}
`;

/**
 * shader配置
 * @private
 */
const SHADER_CONFIG = {
  source:AutoExposureShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    u_LAvg:{
      name:'u_LAvg',
      type:DataType.FLOAT
    },
    u_KeyValue:{
      name:'u_KeyValue',
      type:DataType.FLOAT
    }
  }
};

/**
 * 自动曝光效果
 * @private
 */
export class AutoExposureEffect extends PostEffectNode{

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

    super( 'AutoExposure', renderTarget, null, SHADER_CONFIG );

    const mtl = this.material;
    mtl.setValue( 'u_LAvg', 0.4 );
    this._LAvg = 0.4;
    mtl.setValue( 'u_KeyValue', 1.0 );
    this._KeyValue = 1.0;

  }

  /**
   * 平均亮度
   */
  get LAvg(){

    return this._LAvg;

  }

  set LAvg( value ){

    this._LAvg = value;
    if( this._LAvg ){

      this.material.setValue( 'u_LAvg', this._LAvg );

    }

  }

  /**
   * 键值
   */
  get KeyValue(){

    return this._KeyValue;

  }

  set KeyValue( value ){

    this._KeyValue = value;
    if( this._KeyValue ){

      this.material.setValue( 'u_KeyValue', this._KeyValue );

    }

  }

}
