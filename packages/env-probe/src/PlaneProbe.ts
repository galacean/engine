import { Entity } from "@alipay/o3-core";
import { Side } from "@alipay/o3-base";
import { Probe } from "./Probe";
import { PlaneProbeConfig } from "./type";

/**
 * 平面探针，用于生成 折射/纹理扰动 等效果
 * */
export class PlaneProbe extends Probe {
  /**
   * 创建探针
   * @param {Entity} node
   * @param {PlaneProbeConfig} config
   * */
  constructor(node: Entity, config: PlaneProbeConfig = {}) {
    super(node, config);
  }

  /**
   * 预处理材质，保存初始状态
   * */
  private storeMaterial() {
    this.renderItems.forEach((item) => {
      const material = item.mtl;
      item.initialSide = material.side;
      material.side = Side.BACK;
    });
  }

  /**
   * 后处理材质，还原初始状态
   * */
  private restoreMaterial() {
    this.renderItems.forEach((item) => {
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
}
