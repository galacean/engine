import { Material, RenderColorTexture, RenderDepthTexture, RenderTarget, RenderTechnique } from "@alipay/o3-material";

const VERT_SHADER = `

#include <common_vert>
#include <normal_share>
#include <shadow_share>

void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <skinning_vert>
    #include <shadow_vert>
    #include <position_vert>

}

`;
const FRAG_SHADER = `

void main() {
  gl_FragColor = vec4(0., 0., 0., 1.0);
}

`;

class DepthMaterial extends Material {
  /**
   * 生成内部所使用的 Technique 对象
   * @private
   */
  _generateTechnique() {
    //--
    const tech = new RenderTechnique("depth_tech");
    tech.isValid = true;
    tech.uniforms = {};
    tech.attributes = {};
    tech.customMacros = [];
    tech.vertexShader = VERT_SHADER;
    tech.fragmentShader = FRAG_SHADER;

    this._technique = tech;
  }

  /**
   * 重写基类方法
   * @private
   */
  prepareDrawing(context, component, primitive) {
    if (this._technique === null) {
      this._generateTechnique();
    }

    super.prepareDrawing(context, component, primitive);
  }
}

export function addDepthTexturePass(camera, mask) {
  const mtl = new DepthMaterial("depth_mtl");
  const renderTarget = new RenderTarget(512, 512, new RenderColorTexture(512, 512), new RenderDepthTexture(512, 512));

  const renderer = camera._renderPipeline;
  renderer.addRenderPass("DepthPass", -1, renderTarget, mtl, mask, [1, 1, 1, 1]);

  return renderTarget;
}
