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
  
uniform sampler2D s_diffuse;  
uniform sampler2D s_grayDiffuse;  
uniform float u_progress;  
uniform float u_cycleTime;  
uniform vec3 u_bodyPosition;  

varying vec2 v_uv;  
varying vec3 v_position;  
  
void main()  
{    
  vec4 texColor = texture2D(s_diffuse, v_uv);  // vec4(1.0, 0.0,0.0,1.0); //   
  vec4 grayColor = texture2D(s_grayDiffuse, v_uv);      
  float t = u_cycleTime * 3.0;    
  float v = 1.0 + sin(t + 2.0 * v_position.x) * 0.10;    
  float alpha = step(u_progress * 2.0, (v_position.y + u_bodyPosition.z + 1.0) * v );   
  gl_FragColor = mix(texColor, grayColor, alpha);  
  
}
`;

/**
 * 支持透明的无光照贴图材质
 */
export class WaveMaterial extends Material {

  static TECH_NAME = 'Wave';
  static DISABLE_SHARE = true;

  /**
   * 构造函数
   * @param {string} name 名称
   */
  constructor( name ) {

    super( name || 'WaveMaterial' );

    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique( 'Wave' );
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


    this.progress = 0.5;
    this.bodyPosition = [0, 0, 0];
    this.cycleTime = 0;

  }

  set progress( v ) {

    this.setValue( 'u_progress', v );

  }
  get progress() {

    return this.getValue( 'u_progress' );

  }

  set cycleTime( v ) {

    this.setValue( 'u_cycleTime', v );

  }
  get cycleTime() {

    return this.getValue( 'u_cycleTime' );

  }

  set bodyPosition( v ) {

    this.setValue( 'u_bodyPosition', v );

  }
  get bodyPosition() {

    return this.getValue( 'u_bodyPosition' );

  }

  /** 创建一个本材质对象的深拷贝对象 */
  clone() {

    const newMtl = new WaveMaterial( this.name );

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
      },
      s_grayDiffuse: {
        name: 's_grayDiffuse',
        paramName: '_GrayMainTex',
        type: DataType.SAMPLER_2D,
      },
      u_bodyPosition: {
        name: 'u_bodyPosition',
        paramName: '_BodyPosition',
        type: DataType.FLOAT_VEC3,
      },
      u_progress: {
        name: 'u_progress',
        paramName: '_Progress',
        type: DataType.FLOAT,
      },
      u_cycleTime: {
        name: 'u_cycleTime',
        paramName: '_CycleTime',
        type: DataType.FLOAT,
      }
    };

    return uniforms;

  }

}
