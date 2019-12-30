import { Node } from "@alipay/o3-core";
import { Side } from "@alipay/o3-base";
import { RenderTarget } from "@alipay/o3-material";
import { Probe } from "./Probe";
import { RenderPass } from "@alipay/o3-renderer-basic";
import { PerturbationProbeConfig } from "./type";

/**
 * 扰动纹理探针，用于生成2D扰动纹理
 * */
export class PerturbationProbe extends Probe {
  private readonly renderTarget: RenderTarget;
  private readonly renderTargetSwap: RenderTarget;
  public renderPass: RenderPass;

  /**
   * 纹理扰动探针
   * @param {Node} node
   * @param {PerturbationProbeConfig} config
   * */
  constructor(node: Node, config: PerturbationProbeConfig = {}) {
    super(node, config);
    this.renderTarget = new RenderTarget("_renderTarget" + this.cacheId, config);
    this.renderTargetSwap = new RenderTarget("_renderTarget_swap" + this.cacheId, config);
    this.renderPass = new RenderPass("_renderPass" + this.cacheId, -10, this.renderTarget);

    /** 自定义渲染管道 */
    this.renderPass.renderOverride = true;
    this.customRenderPass();

    this.sceneRenderer.addRenderPass(this.renderPass);
  }

  /**
   * 预处理材质，保存初始状态
   * */
  private storeMaterial(item) {
    let material = item.mtl;
    if (this.renderList.indexOf(material) !== -1) {
      // 打标，减少数组查找次数
      item.__probe__ = true;
      item.initialSide = material.side;
      material.side = Side.BACK;
    }
  }

  /**
   * 后处理材质，还原初始状态
   * */
  private restoreMaterial(item) {
    let material = item.mtl;
    if (item.__probe__) {
      material.side = item.initialSide;
      delete item.initialSide;
      delete item.__probe__;
    }
  }

  protected customRenderPass() {
    this.renderPass.preRender = () => {
      this.renderItems.forEach(item => {
        this.storeMaterial(item);
      });
    };
    this.renderPass.postRender = () => {
      this.renderItems.forEach(item => {
        this.restoreMaterial(item);
      });

      // 交换 FBO
      // prevent issue: Feedback Loops Between Textures and the Framebuffer.
      if (this.renderPass.enabled) {
        // 钩子
        this.onTextureChange(this.texture, this.depthTexture);

        if (this.renderPass.renderTarget === this.renderTarget) {
          this.renderPass.renderTarget = this.renderTargetSwap;
        } else {
          this.renderPass.renderTarget = this.renderTarget;
        }
      }
    };

    this.renderPass.render = camera => {
      this.renderItems.forEach(item => {
        const { nodeAbility, primitive, mtl } = item;
        if (!(nodeAbility.renderPassFlag & this.renderPassFlag)) return;

        // render
        mtl.prepareDrawing(camera, nodeAbility, primitive);
        this.rhi.drawPrimitive(primitive, mtl);
      });
    };
  }
}
