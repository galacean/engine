import { DataType } from '@alipay/r3-base';
import { PostEffectNode } from './PostEffectNode';
import DOFShader from './shaders/DOF.glsl';

const SHADER_CONFIG = {
  source:DOFShader,
  uniforms : {
    s_sourceRT: {
      name: 's_sourceRT',
      type: DataType.SAMPLER_2D,
    },
    s_sceneDepth: {
      name: 's_sceneDepth',
      type: DataType.SAMPLER_2D,
    },
    u_zNear:{
      name:'u_zNear',
      type:DataType.FLOAT
    },
    u_zFar:{
      name:'u_zFar',
      type:DataType.FLOAT
    },
    u_textureWidth:{
      name:'u_textureWidth',
      type:DataType.FLOAT
    },
    u_textureHeight:{
      name:'u_textureHeight',
      type:DataType.FLOAT
    },
    u_focusDepth:{
      name:'u_focusDepth',
      type:DataType.FLOAT
    },
    u_focusLength:{
      name:'u_focusLength',
      type:DataType.FLOAT
    },
    u_focusStop:{
      name:'u_focusStop',
      type:DataType.FLOAT
    },
    u_dither:{
      name:'u_dither',
      type:DataType.FLOAT
    },
    u_maxBlur:{
      name:'u_maxBlur',
      type:DataType.FLOAT
    },
    u_showFocus:{
      name:'u_showFocus',
      type:DataType.FLOAT
    },
  },
  macros:{
    SAMPLES:4,  // 1~12
    RINGS:3     // 1~8
  }
};

/**
 * 景深效果
 */
export class DepthOfFieldEffect extends PostEffectNode{

  /**
   * 构造函数
   * @param {PostProcessFeature} manager 插件对象
   * @param {object} props 配置项
   */
  constructor( manager, props ){

    const rtPool = manager.renderTargets;

    let renderTarget = null;

    if ( props && props.rtSize ) {

      renderTarget = rtPool.require( 'scene_renderTarget', {
        width: props.rtSize,
        height: props.rtSize,
        clearColor: [ 0.0, 0.0, 0.0, 1.0 ],
      } );

    }else{

      renderTarget = rtPool.require( 'scene_1024' );

    }

    super( 'DepthOfField', renderTarget, null, SHADER_CONFIG );

    this._depthTexture = null;
    if( props && props.depthTexture )
      this.depthTexture = props.depthTexture;

    const mtl = this.material;
    mtl.setValue( 'u_textureWidth', 1024 );
    mtl.setValue( 'u_textureHeight', 1024 );
    mtl.setValue( 'u_dither', 0.001 );


    mtl.setValue( 'u_focusDepth', 140.0 );
    this._focusDepth = 140.0;
    mtl.setValue( 'u_focusLength', 68.0 );
    this._focusLength = 68.0;
    mtl.setValue( 'u_focusStop', 0.9 );
    this._focusStop = 0.9;
    mtl.setValue( 'u_maxBlur', 1.5 );
    this._maxBlur = 1.5;
    mtl.setValue( 'u_showFocus', -1.0 );
    this._showFocus = -1.0;

  }

  setupMaterial( camera ){

    super.setupMaterial( camera );

    const mtl = this.material;

    mtl.setValue( 'u_zNear', camera.near );
    mtl.setValue( 'u_zFar', camera.far );

  }

  /**
   * 场景深度 贴图
   */
  get depthTexture(){

    return this._depthTexture;

  }

  set depthTexture( value ){

    this._depthTexture = value;
    if( this._depthTexture ){

      this.material.setValue( 's_sceneDepth', this._depthTexture );

    }

  }

  /**
   * 焦点距离
   */
  get focusDepth(){

    return this._focusDepth;

  }

  set focusDepth( value ){

    this._focusDepth = value;
    if( this._focusDepth ){

      this.material.setValue( 'u_focusDepth', this._focusDepth );

    }

  }

  get showFocus(){

    return this._showFocus;

  }

  set showFocus( value ){

    this._showFocus = value;
    if( this._showFocus ){

      this.material.setValue( 'u_showFocus', this._showFocus );

    }

  }

  /**
   * 焦点扩展距离
   */
  get focusLength(){

    return this._focusLength;

  }

  set focusLength( value ){

    this._focusLength = value;
    if( this._focusLength ){

      this.material.setValue( 'u_focusLength', this._focusLength );

    }

  }

  get focusStop(){

    return this._focusStop;

  }

  set focusStop( value ){

    this._focusStop = value;
    if( this._focusStop ){

      this.material.setValue( 'u_focusStop', this._focusStop );

    }

  }

  /**
   * 最大模糊程度
   */
  get maxBlur(){

    return this._maxBlur;

  }

  set maxBlur( value ){

    this._maxBlur = value;
    if( this._maxBlur ){

      this.material.setValue( 'u_maxBlur', this._maxBlur );

    }

  }

};
