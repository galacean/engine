import { ACamera, Node, NodeAbility } from "@alipay/o3-core";
import { Material, Texture2D, TextureCubeMap } from "@alipay/o3-material";
import { BasicSceneRenderer, RenderPass } from "@alipay/o3-renderer-basic";
import { GLRenderHardware } from "@alipay/o3-rhi-webgl";
import { ProbeConfig } from "./type";

let cacheId = 0;

/**
 * 环境探针类，提供诸如反射折射等需要的功能
 * */
export abstract class Probe extends NodeAbility {
  protected readonly cacheId: number;

  public camera: ACamera;
  public renderList: Material[];
  public renderAll: boolean;
  public excludeRenderList: Material[];

  public abstract renderPass: RenderPass;

  /**
   * 自定义 renderPass
   * */
  protected abstract customRenderPass();

  /**
   *探针基类
   * @param {Node} node
   * @param {ProbeConfig} config
   * */
  protected constructor(node: Node, config: ProbeConfig = {}) {
    super(node, config);
    this.cacheId = cacheId++;

    this.camera = config.camera || node.scene.activeCameras[0];
    this.renderList = config.renderList || [];
    this.excludeRenderList = config.excludeRenderList || [];
    this.renderAll = !!config.renderAll;

    /**
     * 继续 RTT
     * */
    this.addEventListener("enabled", () => {
      this.renderPass.enabled = true;
    });

    /**
     * 暂停 RTT（ render target to texture）
     * */
    this.addEventListener("disabled", () => {
      this.renderPass.enabled = false;
    });
  }

  protected get sceneRenderer(): BasicSceneRenderer {
    return this.camera.sceneRenderer;
  }

  protected get rhi(): GLRenderHardware {
    return this.camera.renderHardware;
  }

  /**
   * 获取需要渲染的真实队列.
   * 1. 排除 sprite
   * 2. 排除 renderList 之外的材质
   * 3. 如果 renderAll，只排除 sprite
   * */
  protected get renderItems() {
    const opaqueQueue = this.sceneRenderer.opaqueQueue;
    const transparentQueue = this.sceneRenderer.transparentQueue;
    return opaqueQueue.items.concat(transparentQueue.items).filter(item => {
      if (!item.primitive) return false;
      if (this.excludeRenderList.includes(item.mtl)) return false;
      if (this.renderAll) return true;
      if (this.renderList.includes(item.mtl)) return true;
    });
  }

  /**
   * 探针所得
   * */
  public get texture(): Texture2D {
    return this.renderPass.renderTarget.texture;
  }

  public get depthTexture(): Texture2D {
    return this.renderPass.renderTarget.depthTexture;
  }

  public get cubeTexture(): TextureCubeMap {
    return this.renderPass.renderTarget.cubeTexture;
  }

  /**
   * prevent issue: Feedback Loops Between Textures and the Framebuffer
   * 提供钩子让用户进行交换 Texture
   * @example
   * probe.onTextureChange = cubeTexture => {
   *   envLight.specularMap = cubeTexture;
   *   skybox.specularMap = cubeTexture;
   * }
   * */
  public onTextureChange(texture: Texture2D | TextureCubeMap, depthTexture?: Texture2D) {}
}
