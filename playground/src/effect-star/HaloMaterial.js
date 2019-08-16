import { MaterialType, UniformSemantic, DataType, RenderState, BlendFunc } from '@alipay/r3-base';
import { Material, RenderTechnique } from '@alipay/r3-material';

const VERT_SHADER = `
uniform mat3 normalMatrix;
uniform mat4 matModelViewProjection;

attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;

varying vec3 v_normal;
varying vec2 v_uv;

void main() {

  gl_Position = matModelViewProjection * vec4(a_position, 1.0 );
  v_normal = normalize(a_normal); // normalize( normalMatrix * a_normal );
  v_uv = a_uv;

}
`;

const FRAG_SHADER = `
varying vec2 v_uv;

uniform sampler2D texturePrimary;
uniform sampler2D textureColor;
uniform float time;
uniform float u_intensity;
 
uniform float spectralLookup;
uniform sampler2D textureSpectral;

void main() {

    vec3 colorIndex = texture2D( texturePrimary, v_uv ).xyz;
    
    float lookupColor = colorIndex.x;
    lookupColor = fract( lookupColor + time * 0.04 );
    lookupColor = clamp(lookupColor,0.2,0.98);
    vec2 lookupUV = vec2( lookupColor, 0. );
    vec3 foundColor = texture2D( textureColor, lookupUV ).xyz;
 
    foundColor.xyz += 0.4;
    foundColor *= 10.0;
 
    float spectralLookupClamped = clamp( spectralLookup, 0., 1. );
    vec2 spectralLookupUV = vec2( 0., spectralLookupClamped );
    vec4 spectralColor = texture2D( textureSpectral, spectralLookupUV );    
 
    spectralColor.x = pow( spectralColor.x, 3. );
    spectralColor.y = pow( spectralColor.y, 3. );
    spectralColor.z = pow( spectralColor.z, 3. );
 
    gl_FragColor = vec4( foundColor * colorIndex * spectralColor.xyz * u_intensity, 1.0 );  // vec4(colorIndex, 1.0); // 
}`;

export class HaloMaterial extends Material {

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
      textureColor: {
        name: 'textureColor',
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
      }
    };

    return uniforms;

  }

}
