import { DataType, RenderState, BlendFunc, MaterialType } from '@alipay/r3-base';
import { Material, RenderTechnique } from '@alipay/r3-material';

import VERT_SHADER from './shader/Vertex.glsl';
import FRAG_SHADER from './shader/Texture.glsl';

/**
 * 支持透明的无光照贴图材质
 */
export class TransparentMaterial extends Material {

  static TECH_NAME = 'Transparent';
  static DISABLE_SHARE = true;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor( name ) {

    super( name || 'TransparentMaterial' );

    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique( 'Transparent' );
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.states = {};
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;
    tech.states = {
      enable: [ RenderState.BLEND ],
      disable: [ RenderState.CULL_FACE ],
      functions: {
        blendFunc: [ BlendFunc.SRC_ALPHA, BlendFunc.ONE_MINUS_SRC_ALPHA ],
        depthMask: [ false ]
      }
    };

    this._technique = tech;
    this.renderType = MaterialType.TRANSPARENT;

  }

  /**
  * 纹理贴图
  * @member {Texture2D}
  */
  set texture( v ) {

    this.setValue( 's_diffuse', v );

  }
  get texture() {

    return this.getValue( 's_diffuse' );

  }

  /** 创建一个本材质对象的深拷贝对象 */
  clone() {

    const newMtl = new TransparentMaterial( this.name );

    newMtl.renderType = this.renderType;

    for ( const name in this._values ) {

      if ( this._values.hasOwnProperty( name ) ) {

        newMtl._values[name] = this._values[name];

      }

    }// end of for

    return newMtl;

  }

  /**
   * 添加 uniform 定义
   * @private
   */
  _generateFragmentUniform() {

    const uniforms = {
      s_diffuse: {
        name: 's_diffuse',
        paramName: '_MainTex',
        type: DataType.SAMPLER_2D,
      }
    };

    return uniforms;

  }

}
