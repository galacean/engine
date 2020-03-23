import { RenderPass } from "@alipay/o3-renderer-basic";
import { MaskList } from "@alipay/o3-base";
import { DeferredMaterial } from "./DeferredMaterial";

export class MainRenderPass extends RenderPass {
  deferredMaterial;
  constructor(name, priority, renderTarget = null) {
    // const material = new ConstantMaterial("xx");
    const material = new DeferredMaterial("deferred");
    super(name, priority, renderTarget, material, MaskList.EVERYTHING);
    this.deferredMaterial = material;
    this.clearMode = 1;
    this.clearParam = [0, 0, 0, 0];
    this.mask = MaskList.MASK2;
  }

  setDiffuse(texture) {
    this.deferredMaterial.setValue(this.deferredMaterial.customUniform.diffuseTexture.name, texture);
  }

  setShiniess(texture) {
    this.deferredMaterial.setValue(this.deferredMaterial.customUniform.shininessTexture.name, texture);
  }

  setNormal(texture) {
    this.deferredMaterial.setValue(this.deferredMaterial.customUniform.normalTexture.name, texture);
  }

  setPosition(texture) {
    this.deferredMaterial.setValue(this.deferredMaterial.customUniform.positionTexture.name, texture);
  }
}
