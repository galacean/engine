import { ComplexMaterial, DataType, RenderColorTexture, RenderTarget, RenderTechnique, ShaderFactory } from "@alipay/o3-core";
import { Vector4 } from "@alipay/o3-math";
import DepthPackingShader from "./shaderLib/depth_packing.glsl";

ShaderFactory.InjectShaderSlices({
  depth_packing: DepthPackingShader
});

const VERT_SHADER = `
precision highp float;

#include <common_vert>
#include <normal_share>
#include <shadow_share>

varying float v_viewDepth;

void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <skinning_vert>
    #include <shadow_vert>
    #include <position_vert>

    vec4 viewPos = u_MVMat*position;

    v_viewDepth = viewPos.z;
}
`;

const FRAG_SHADER = `
precision highp float;

#include <depth_packing>

uniform float u_zNear;
uniform float u_zFar;

varying float v_viewDepth;

void main() {

  // float d = 1.0-smoothstep( u_zNear, u_zFar, v_viewDepth );
  //float d = (v_viewDepth-u_zNear)/(u_zFar-u_zNear);
  //note view depth is negative,so we normalize it
  float d = (-v_viewDepth - u_zNear)/(u_zFar - u_zNear);
	gl_FragColor = packDepthToRGBA(d);
}
`;

export class DepthMaterial extends ComplexMaterial {
  _generateTechnique(caemra, component) {
    //debugger;
    const tech = new RenderTechnique("DepthPassTech");
    tech.isValid = true;
    tech.uniforms = {
      u_zNear: {
        name: "u_zNear",
        type: DataType.FLOAT
      },
      u_zFar: {
        name: "u_zFar",
        type: DataType.FLOAT
      }
    };
    tech.attributes = {};
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;

    return tech;
  }
}

export function addDepthPass(camera, mask, renderTargetSize) {
  const mtl = new DepthMaterial("DepthPassMtl");
  // mtl.technique = tech;
  mtl.setValue("u_zNear", camera.nearClipPlane);
  mtl.setValue("u_zFar", camera.farClipPlane);

  //--
  const renderTarget = new RenderTarget(
    renderTargetSize,
    renderTargetSize,
    new RenderColorTexture(renderTargetSize, renderTargetSize)
  );

  camera._renderPipeline.addRenderPass("DepthPass", -1, renderTarget, mtl, mask, new Vector4(1, 1, 1, 1));

  return renderTarget;
}
