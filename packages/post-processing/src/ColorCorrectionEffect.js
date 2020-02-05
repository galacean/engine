import { DataType, TextureWrapMode } from '@alipay/o3-base';
import { PostEffectNode } from './PostEffectNode';
import ColorCorrectionShader from './shaders/ColorCorrection.glsl';

const SHADER_CONFIG = {
  source:ColorCorrectionShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    s_ramp: {
      name: 's_ramp',
      type: DataType.SAMPLER_2D,
    }
  }
};

/**
 * 屏幕空间的图像颜色校正效果
 */
export class ColorCorrectionEffect extends PostEffectNode{

  /**
   * 构造函数
   * @param {PostProcessFeature} manager 插件对象
   * @param {object} props 配置项
   */
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

    super( 'ColorCorrection', renderTarget, null, SHADER_CONFIG );

    this._rampTexture = null;
    if( props ){

      this.rampTexture = props.rampTexture;

    }

  }

  /**
   * Ramp 贴图
   */
  get rampTexture(){

    return this._rampTexture;

  }

  set rampTexture( value ){

    this._rampTexture = value;
    if( this._rampTexture ){

      this._rampTexture.setWrapMode( TextureWrapMode.CLAMP_TO_EDGE, TextureWrapMode.CLAMP_TO_EDGE );
      this.material.setValue( 's_ramp', this._rampTexture );

    }

  }


}
