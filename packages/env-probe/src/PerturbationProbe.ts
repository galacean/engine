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
  /**
   * 纹理扰动探针
   * @param {Node} node
   * @param {PerturbationProbeConfig} config
   * */
  constructor(node: Node, config: PerturbationProbeConfig = {}) {
    super(node, config);
  }

  /**
   * 预处理材质，保存初始状态
   * */
  private storeMaterial() {
    this.renderItems.forEach(item => {
      const material = item.mtl;
      item.initialSide = material.side;
      material.side = Side.BACK;
    });
  }

  /**
   * 后处理材质，还原初始状态
   * */
  private restoreMaterial() {
    this.renderItems.forEach(item => {
      const material = item.mtl;
      material.side = item.initialSide;
      delete item.initialSide;
    });
  }

  protected preRender() {
    super.preRender();
    this.storeMaterial();
  }

  protected postRender() {
    super.postRender();
    this.restoreMaterial();
  }

  public set width(width: number) {
    this.renderTarget.width = width;
    this.renderTargetSwap.width = width;
    this.renderTarget.needRecreate = true;
    this.renderTargetSwap.needRecreate = true;
  }

  public set height(height: number) {
    this.renderTarget.height = height;
    this.renderTargetSwap.height = height;
    this.renderTarget.needRecreate = true;
    this.renderTargetSwap.needRecreate = true;
  }
}
