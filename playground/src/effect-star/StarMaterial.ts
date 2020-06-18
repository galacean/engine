import { UniformSemantic, DataType, RenderState, BlendFunc } from "@alipay/o3-base";
import { Material, RenderTechnique } from "@alipay/o3-material";

const VERT_SHADER = `
uniform mat4 normalMatrix;
uniform mat4 matModelViewProjection;
uniform mat4 u_viewMat;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_uv;

varying vec3 v_normal;
varying vec2 v_uv;

void main() {

  gl_Position = matModelViewProjection * vec4(a_position, 1.0 );
  v_normal = normalize( (normalMatrix * vec4(a_normal, 1.0)).xyz );
  v_uv = a_uv;

}
`;

const FRAG_SHADER = `
uniform mat4 viewMatrix;
varying vec2 v_uv;
varying vec3 v_normal;
uniform sampler2D texturePrimary;
uniform sampler2D textureColor;
uniform sampler2D textureSpectral;
uniform float time;
uniform float spectralLookup;

uniform float u_rotate_speed;
uniform float u_burn;

void main() {
    float uvMag = 2.0;
    float paletteSpeed = 0.2;
    float minLookup = 0.2;
    float maxLookup = 0.98;
    //  let's double up on the texture to make the sun look more detailed
    vec2 uv = v_uv * uvMag;
 
    //  do a lookup for the texture now, but hold on to its gray value
    vec3 colorIndex = texture2D( texturePrimary, uv ).xyz;
    float lookupColor = colorIndex.x;
 
    //  now cycle the value, and clamp it, we're going to use this for a second lookup
    lookupColor = fract( lookupColor - time * paletteSpeed );
    lookupColor = clamp(lookupColor, minLookup, maxLookup );
 
    //  use the value found and find what color to use in a palette texture
    vec2 lookupUV = vec2( lookupColor, 0. );
    vec3 foundColor = texture2D( textureColor, lookupUV ).xyz;
 
    //  now do some color grading
    foundColor.xyz *= 0.6;
    foundColor.x = pow(foundColor.x, 2.);
    foundColor.y = pow(foundColor.y, 2.);
    foundColor.z = pow(foundColor.z, 2.);
 
    foundColor.xyz += vec3( 0.6, 0.6, 0.6 ) * 1.4;
    // foundColor.xyz += vec3(0.6,0.35,0.21) * 2.2;
 
    float spectralLookupClamped = clamp( spectralLookup, 0., 1. );
    vec2 spectralLookupUV = vec2( 0., spectralLookupClamped );
    vec4 spectralColor = texture2D( textureSpectral, spectralLookupUV );   
 
    spectralColor.x = pow( spectralColor.x, 2. );
    spectralColor.y = pow( spectralColor.y, 2. );
    spectralColor.z = pow( spectralColor.z, 2. );
    
    foundColor.xyz *= spectralColor.xyz;   
    
    //  apply a secondary, subtractive pass to give it more detail
    //  first we get the uv and apply some warping
    vec2 uv2 = vec2(  v_uv.x +  time * 0.001,  v_uv.y );
    
    vec3 texSample 	= texture2D( texturePrimary, uv2 ).rgb;
	  float uOff		= ( texSample.g * 0.01 * u_burn + time * 0.02 * u_rotate_speed);
		uv2		= v_uv + vec2( uOff, 0.0 );
		
    vec3 secondaryColor = texture2D( texturePrimary, uv2 ).rgb;

    //  finally give it an outer rim to blow out the edges
    float intensity = 1.15 - dot( v_normal, vec3( 0.0, 0.0, 0.3 ) );
    vec3 outerGlow = vec3( 1.0, 0.8, 0.6 ) * pow( intensity, 6.0 );
 
    vec3 desiredColor = foundColor  + outerGlow - secondaryColor;
    float darkness = 1.0 - clamp( length( desiredColor ), 0., 1. );
    vec3 colorCorrection = vec3(0.7, 0.4, 0.01) * pow(darkness,2.0) * secondaryColor;
    desiredColor += colorCorrection;
    
    // the final composite color
    gl_FragColor = vec4( desiredColor, 1.0 );
}`;

export class StarMaterial extends Material {
  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique(camera, component) {
    const customMacros = [];
    const uniforms = this._generateFragmentUniform();

    //--
    const tech = new RenderTechnique(this.name);
    tech.isValid = true;
    tech.uniforms = uniforms;
    tech.attributes = {};
    tech.states = {};
    tech.customMacros = customMacros;
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;
    tech.states = {
      enable: [RenderState.CULL_FACE],
      enable: [RenderState.BLEND],
      functions: {
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ZERO],
        depthMask: [false] //[gl.FALSE]
      }
    };

    this._technique = tech;
  }

  prepareDrawing(camera, component, primitive?) {
    if (!this._technique) {
      this._generateTechnique(camera, component);
    }

    super.prepareDrawing(camera, component, primitive);
  }

  _generateFragmentUniform() {
    let uniforms = {
      matModelViewProjection: {
        name: "matModelViewProjection",
        semantic: UniformSemantic.MODELVIEWPROJECTION,
        type: DataType.FLOAT_MAT4
      },
      normalMatrix: {
        name: "normalMatrix",
        semantic: UniformSemantic.MODELVIEWINVERSETRANSPOSE,
        type: DataType.FLOAT_MAT4
      },
      time: {
        name: "time",
        semantic: UniformSemantic.TIME,
        type: DataType.FLOAT
      },
      texturePrimary: {
        name: "texturePrimary",
        type: DataType.SAMPLER_2D
      },
      textureColor: {
        name: "textureColor",
        type: DataType.SAMPLER_2D
      },
      textureSpectral: {
        name: "textureSpectral",
        type: DataType.SAMPLER_2D
      },
      spectralLookup: {
        name: "spectralLookup",
        type: DataType.FLOAT
      },
      u_rotate_speed: {
        name: "u_rotate_speed",
        type: DataType.FLOAT
      },
      u_burn: {
        name: "u_burn",
        type: DataType.FLOAT
      }
    };

    return uniforms;
  }
}
