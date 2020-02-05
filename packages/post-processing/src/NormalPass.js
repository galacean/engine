import { DataType, RenderState, UniformSemantic } from '@alipay/o3-base';
import { RenderTarget } from '@alipay/o3-material';
import { Material, RenderTechnique, ComplexMaterial } from '@alipay/o3-material';

import { ShaderFactory } from '@alipay/o3-shaderlib';
import DepthPackingShader from './shaderLib/depth_packing.glsl';
ShaderFactory.InjectShaderSlices( {
  depth_packing:DepthPackingShader
} );


const VERT_SHADER = `

precision highp float;

#include <common_vert>
#include <normal_share>
#include <shadow_share>

uniform mat4 matModelViewInverseTranspose;

void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <skinning_vert>
    #include <shadow_vert>
    #include <position_vert>

    v_normal = normalize(matModelViewInverseTranspose * vec4(normal,0.0)).xyz;
}
`;

const FRAG_SHADER = `
precision highp float;

varying vec3 v_normal;

vec3 packNormalToRGB( vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}

void main() {
  gl_FragColor = vec4(packNormalToRGB(v_normal),1.0);
}
`;

class NormalPassMaterial extends ComplexMaterial {

  _generateTechnique( caemra, component ) {

    //debugger;
    const tech = new RenderTechnique( 'normalPassTechnique' );
    tech.isValid = true;
    tech.uniforms = {
      matModelViewInverseTranspose: {
        name: 'matModelViewInverseTranspose',
        semantic: UniformSemantic.MODELVIEWINVERSETRANSPOSE,
        type: DataType.FLOAT_MAT4,
      }
    };
    tech.attributes = {};
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;

    return tech;

  }

};

export function addNormalPass( camera, mask, renderTargetSize ){

  const mtl = new NormalPassMaterial( 'NormalPassMtl' );
  mtl.renderStates = {
    disable: [ RenderState.CULL_FACE ]
  };
  //--
  const renderTarget = new RenderTarget( 'normalTarget', {
    width: renderTargetSize[0],
    height: renderTargetSize[1],
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ],
  } );

  camera.sceneRenderer.addRenderPass( 'NormalPass', -2, renderTarget, mtl, mask );

  return renderTarget;

}
