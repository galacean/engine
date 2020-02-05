import { Scene } from "@alipay/o3-core";
import { MaskList, RefreshRate, Side, Logger } from "@alipay/o3-base";
import { Texture2D, RenderTarget } from "@alipay/o3-material";
import { PBRMaterial } from "@alipay/o3-pbr";
import { Probe } from "./Probe";
import { RenderPass } from "@alipay/o3-renderer-basic";

type ClearColor = [number, number, number, number];

interface PerturbationProbeConfig {
  /** probe config */
  renderList?: Array<PBRMaterial>;
  renderMask?: MaskList;
  refreshRate?: RefreshRate;
  /** renderTarget config */
  width?: number;
  height?: number;
  clearColor?: ClearColor;
  enableDepthTexture?: boolean;
}

/**
 * 扰动纹理探针，用于生成2D扰动纹理
 * */
export class PerturbationProbe extends Probe {
  renderTarget: RenderTarget;
  renderPass: RenderPass;
  scene: Scene;

  /**
   * 纹理扰动探针
   * @param {string} name
   * @param {PerturbationProbeConfig} config
   * */
  constructor(name: string, scene: Scene, config: PerturbationProbeConfig = {}) {
    super(name, config);
    this.scene = scene;
    this.renderTarget = new RenderTarget(name + "_renderTarget", config);
    this.renderPass = new RenderPass(name + "_renderPass", -2, this.renderTarget);
    /** 自定义渲染管道 */
    this.renderPass.renderOverride = true;
    if (!(scene instanceof Scene)) {
      Logger.error("PerturbationProbe need scene!");
      return;
    }
    if (!scene.activeCameras.length) {
      Logger.error("no active camera found in current scene!");
      return;
    }

    this.handleRenderPass();
    this.sceneRenderer.addRenderPass(this.renderPass);
  }

  /**
   * 获取第一个sceneRenderer
   * */
  private get sceneRenderer() {
    return this.scene.activeCameras[0].sceneRenderer;
  }

  /**
   * rhi
   * */
  private get rhi() {
    return this.scene.activeCameras[0].renderHardware;
  }

  /**
   * 渲染队列，排除sprite
   * */
  private get renderItems() {
    let opaqueQueue = this.sceneRenderer.opaqueQueue;
    let transparentQueue = this.sceneRenderer.transparentQueue;
    let renderItems = opaqueQueue.items.concat(transparentQueue.items).filter(item => item.primitive);
    return renderItems;
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
      item.initialPT = material.perturbationTexture;
      material.side = Side.BACK;
      material.perturbationTexture = null;
    }
  }

  /**
   * 后处理材质，还原初始状态
   * */
  private restoreMaterial(item) {
    let material = item.mtl;
    if (item.__probe__) {
      material.side = item.initialSide;
      material.perturbationTexture = item.initialPT;
      delete item.initialSide;
      delete item.initialPT;
      delete item.__probe__;
    }
  }

  /**
   * 处理renderPass
   * */
  private handleRenderPass() {
    this.renderPass.preRender = () => {
      this.renderItems.forEach(item => {
        this.storeMaterial(item);
      });
    };

    this.renderPass.postRender = () => {
      this.renderItems.forEach(item => {
        this.restoreMaterial(item);
      });
    };

    this.renderPass.render = camera => {
      this.renderItems.forEach(item => {
        const { nodeAbility, primitive, mtl } = item;
        if (!item.__probe__) return;
        if (!(nodeAbility.renderPassFlag & this.renderMask)) return;

        this.rhi.flushSprite();
        mtl.prepareDrawing(camera, nodeAbility, primitive);
        this.rhi.drawPrimitive(primitive, mtl);
      });
      this.rhi.flushSprite();
    };
  }

  /**
   * 探针所得
   * */
  get texture(): Texture2D {
    return this.renderTarget.texture;
  }

  get depthTexture(): Texture2D {
    return this.renderTarget.depthTexture;
  }
}
