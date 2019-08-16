import { DataType, RenderState, BlendFunc, MaterialType } from '@alipay/r3-base';
import { Material, RenderTechnique } from '@alipay/r3-material';

const VERT_SHADER = `
#include <common_vert>
#include <normal_share>
#include <shadow_share>

varying vec2 v_uv;
varying vec3 v_position;  
void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <skinning_vert>
    #include <shadow_vert>
    #include <position_vert>

    v_position = position.xyz;
    v_uv = a_uv;
}
`;

const FRAG_SHADER = `
precision mediump float;
precision mediump int;  
  

varying vec2 v_uv;  
varying vec3 v_position;  
  
void main()  
{      
  gl_FragColor = vec4(0.23, 0.31, 0.45, 0.2);  
  
}
`;

/**
 * 支持透明的无光照贴图材质
 */
export class CircleMaterial extends Material {

  static TECH_NAME = 'Circle';
  // static DISABLE_SHARE = true;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor( name ) {

    super( name || 'CircleMaterial' );

    //--
    const tech = new RenderTechnique( 'Wave' );
    tech.isValid = true;
    tech.uniforms = {};
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

  /** 创建一个本材质对象的深拷贝对象 */
  clone() {

    const newMtl = new CircleMaterial( this.name );

    newMtl.renderType = this.renderType;

    for ( const name in this._values ) {

      if ( this._values.hasOwnProperty( name ) ) {

        newMtl._values[name] = this._values[name];

      }

    }// end of for

    return newMtl;

  }


}
