import { UniformSemantic, DataType,  RenderState, BlendFunc } from '@alipay/o3-base';
import { Material, RenderTechnique } from '@alipay/o3-material';

//-- 创建一个新的 Technique
const VERT_SHADER = `
#include <common_vert>
varying vec3 v_p;

void main() {

  v_p = a_position;
  #include <begin_position_vert>
  #include <position_vert>

}
 `;


const FRAG_SHADER = `
#include <common>
#include <common_frag>
#include <noise_cellular>
// or #include <noise_cellular_3D>

vec2 test(vec2 v) {
  return v;
}

vec2 test(vec3 v) {
  return v.xy;
}

varying vec3 v_p;

// See "Combustible Voronoi"
// https://www.shadertoy.com/view/4tlSzl
vec3 firePalette(float i){

    float T = 1400. + 1300.*i; // Temperature range (in Kelvin).
    vec3 L = vec3(7.4, 5.6, 4.4); // Red, green, blue wavelengths (in hundreds of nanometers).
    L = pow(L,vec3(5.0)) * (exp(1.43876719683e5/(T*L))-1.0);
    return 1.0-exp(-5e8/L); // Exposure level. Set to "50." For "70," change the "5" to a "7," etc.
}

void main(void) {

  vec3 blue = vec3(0.1, 0.0, 0.7);
  vec3 red = vec3(0.0, 0.53, 0.89);

  vec2 ii = test( v_p.xy );
  vec3 i = vec3( test(v_p), v_p.z );
  i.z += u_time * 2.0;
  float index = cellular(i * 0.3).x;

  gl_FragColor = vec4(firePalette(index), index);
  
  // gl_FragColor = vec4(mix(blue, red, index), index);
}
`;

export class NoiseMaterial extends Material {

  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique() {

    //--
    const tech = new RenderTechnique( this.name );
    tech.isValid = true;
    tech.uniforms = {};
    tech.attributes = {};
    tech.states = {
      enable: [RenderState.BLEND],
      functions: {
        blendFunc: [BlendFunc.SRC_ALPHA, BlendFunc.ONE],
        depthMask: [false]//[gl.FALSE]
      }
    };
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;

    this._technique = tech;

  }

  /**
   * 重写基类方法
   * @private
   */
  prepareDrawing( camera, component, primitive ) {


    if ( this._technique === null ) {

      this._generateTechnique();

    }

    super.prepareDrawing( camera, component, primitive );

  }

}
