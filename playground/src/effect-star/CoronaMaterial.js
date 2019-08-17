import { MaterialType, UniformSemantic, DataType, RenderState, BlendFunc } from '@alipay/o3-base';
import { Material, RenderTechnique } from '@alipay/o3-material';

const VERT_SHADER = `
uniform mat3 normalMatrix;
uniform mat4 matModelViewProjection;
uniform mat4 u_modelMat;

attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;

varying vec2 v_uv;
varying vec3 v_pos;

void main() {

  gl_Position = matModelViewProjection * vec4(a_position, 1.0 );
  v_uv = a_uv;
  v_pos = (u_modelMat * vec4(a_position, 1.0 )).xyz;
}
`;

const FRAG_SHADER = `
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;

uniform sampler2D texturePrimary;
 
uniform float spectralLookup;
uniform sampler2D textureSpectral;
uniform float u_intensity;
uniform float u_backDecay; 

varying vec2 v_uv;
varying vec3 v_pos; 

void main() {
    vec2 uv = v_uv;
     
    vec4 foundColor = texture2D( texturePrimary, uv );
    foundColor.x *= 1.4;
    foundColor.y *= 1.2;
    foundColor.z *= 0.7;
    //foundColor.xyz *= 10.0;
    foundColor = clamp( foundColor, 0., 1. );   
 
    float spectralLookupClamped = clamp( spectralLookup, 0., 1. );
    vec2 spectralLookupUV = vec2( 0., spectralLookupClamped );
    vec4 spectralColor = texture2D( textureSpectral, spectralLookupUV );    
 
    spectralColor.x = pow( spectralColor.x, 2. );
    spectralColor.y = pow( spectralColor.y, 2. );
    spectralColor.z = pow( spectralColor.z, 2. );
 
    spectralColor.xyz += 0.2;
 
    vec3 finalColor = clamp( foundColor.xyz * spectralColor.xyz * u_intensity , 0., 1.);
    if (length(v_pos) < 3.) {
      finalColor *= u_backDecay;
    }
    gl_FragColor = vec4( finalColor, 1.0 );
 
}`;

export class  CoronaMaterial extends Material {

  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique( camera, component ) {

    const customMacros = [];
    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique( this.name );
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.states = {};
    tech.customMacros = customMacros;
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;
    tech.states = {
      enable: [
        RenderState.CULL_FACE,
      ],
      enable: [RenderState.BLEND],
      functions: {
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE],
        depthMask: [false]//[gl.FALSE]
      }
    };

    this._technique = tech;
    this.renderType = MaterialType.TRANSPARENT;
  }

  prepareDrawing( camera, component, primitive ) {

    if ( !this._technique ) {

      this._generateTechnique(  camera, component );

    }

    super.prepareDrawing( camera, component, primitive );

  }

  /**
   * 添加 uniform 定义
   * @private
   */
  _generateFragmentUniform() {

    let uniforms = {
      matModelViewProjection: {
        name: 'matModelViewProjection',
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4,
      },
      time: {
        name: 'time',
        semantic: UniformSemantic.TIME,
        type: DataType.FLOAT,
      },
      texturePrimary: {
        name: 'texturePrimary',
        type: DataType.SAMPLER_2D,
      },
      textureSpectral: {
        name: 'textureSpectral',
        type: DataType.SAMPLER_2D,
      },
      spectralLookup: {
        name: 'spectralLookup',
        type: DataType.FLOAT,
      },
      u_intensity: {
        name: 'u_intensity',
        type: DataType.FLOAT,
      },
      u_backDecay: {
        name: 'u_backDecay',
        type: DataType.FLOAT,
      }
    };

    return uniforms;

  }

}
