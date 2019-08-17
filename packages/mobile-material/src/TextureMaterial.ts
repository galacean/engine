import { RenderState, DataType } from '@alipay/o3-base';
import { Material, RenderTechnique } from '@alipay/o3-material';
import VERT_SHADER from './shader/Vertex.glsl';
import FRAG_SHADER from './shader/Texture.glsl';

/**
 * 无光照贴图材质
 */
export class TextureMaterial extends Material {

  static TECH_NAME = 'Texture';
  static DISABLE_SHARE = true;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor( name ) {

    super( name || 'TextureMaterial' );

    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique( 'Texture' );
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;
    tech.states = {};

    this._technique = tech;

  }

  /**
   * 设定材质参数值
   * @param {string} name 参数名称
   * @param {*} value 参数值
   */
  setValue( name, value ) {

    if ( name === 'doubleSided' ) {

      this._setDoubleSidedDisplay(value);

    }

    super.setValue( name, value );

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

  /**
  * 是否双面显示
  * @member {boolean}
  */
  set doubleSided(v) {

    this.setValue('doubleSided', v);

  }
  get doubleSided() {

    return this.getValue('doubleSided');

  }

  /** 创建一个本材质对象的深拷贝对象 */
  clone() {

    const newMtl = new TextureMaterial( this.name );

    newMtl.renderType = this.renderType;

    for ( const name in this._values ) {

      if ( this._values.hasOwnProperty( name ) ) {

        newMtl._values[name] = this._values[name];

      }

    }// end of for

    newMtl._technique.states = this._technique.states;

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
      },
      doubleSided: {
        name: 'doubleSided',
        paramName: 'doubleSided',
        type: DataType.BOOL,
      }
    };

    return uniforms;

  }

  /**
   * 设置材质是否双面显示
   * @private
   */
  _setDoubleSidedDisplay(value) {

    this._technique.states.disable = [];
    this._technique.customMacros = [];

    if (value) {
      this._technique.states.disable.push(RenderState.CULL_FACE);
      this._technique.customMacros.push('O3_DOUBLE_SIDE');
    }
  }
}
