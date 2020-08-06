import { DataType } from "@alipay/o3-core";
import { PostEffectNode } from "../PostEffectNode";
import CompositeShader from "../shaders/Composite.glsl";

/**
 * 将多张 Render Target 合成到父节点的 Render Target 上
 */
export class CompositeNode extends PostEffectNode {
  //-- simple for
  constructor(name, renderTarget, parent, mipCount, simple) {
    super(name, renderTarget, parent, makeShaderConfig(mipCount, simple));

    this._bloomStrength = 1.8;
    this._chooser = 3.0;
    this.material.setValue("u_bloomStrength", this._bloomStrength);
    this.material.setValue("u_chooser", this._chooser);
  }

  /**
   * 合成强度
   */
  get strength() {
    return this._bloomStrength;
  }

  set strength(value) {
    this._bloomStrength = value;
    this.material.setValue("u_bloomStrength", this._bloomStrength);
  }

  /**
   * draw mode chooser
   */

  get chooser() {
    return this._chooser;
  }

  set chooser(value) {
    this._chooser = value;
    this.material.setValue("u_chooser", this._chooser);
  }

  /**
   * 设置需要合成的 Render Targets
   * @param {Array} rtArray 需要合成的所有 Mip Map Render Targets
   */
  setCompositeRenderTargets(rtArray) {
    for (let i = 0; i < rtArray.length; i++) {
      this.material.setValue(`s_compositeRT[${i}]`, rtArray[i].getColorTexture());
    }
  }
}

function makeShaderConfig(mipCount, simple) {
  const compositeUniforms = {
    s_sourceRT: {
      name: "s_sourceRT",
      type: DataType.SAMPLER_2D
    },
    u_bloomStrength: {
      name: "u_bloomStrength",
      type: DataType.FLOAT
    },
    u_chooser: {
      name: "u_chooser",
      type: DataType.FLOAT
    }
  };
  for (let i = 0; i < mipCount; i++) {
    const name = `s_compositeRT[${i}]`;
    compositeUniforms[name] = {
      name,
      type: DataType.SAMPLER_2D
    };
  }

  let macros = { MIP_COUNT: mipCount };
  if (simple != undefined) {
    macros.SIMPLE = simple;
  }

  return {
    source: CompositeShader,
    uniforms: compositeUniforms,
    macros
  };
}
