import { MultiRenderTarget, RenderTarget, RenderColorTexture, RenderDepthTexture } from "@alipay/o3-material";
import { RenderBufferDepthFormat } from "@alipay/o3-base";
import { MRTRenderPass } from "./MRTRenderPass";
import { MainRenderPass } from "./MainRenderPass";
import { vec3 } from "@alipay/o3-math";
import { SceneVisitor } from "@alipay/o3-core";
import { ACamera } from "@alipay/o3-default-camera";
import { RenderQueue } from "@alipay/o3-renderer-basic";

/**
 * 使用指定的CameraComponent对象，渲染当前场景中的所有可见对象
 * @class
 */
export class MRTSceneRenderer extends SceneVisitor {
  /**
   * 构造函数
   * @param {ACamera} camera 摄像机对象
   */
  constructor(camera) {
    super();

    this._camera = camera;
    this._opaqueQueue = new RenderQueue(); // 不透明对象的渲染队列

    // const multiRenderTarget = new MultiRenderTarget("multi-render-target", {
    //   enableDepthTexture: true
    // });

    const size = 1024;
    const rhi = camera.renderHardware;
    const multiRenderTarget = new RenderTarget(
      rhi,
      size,
      size,
      [
        new RenderColorTexture(rhi, size, size),
        new RenderColorTexture(rhi, size, size),
        new RenderColorTexture(rhi, size, size),
        new RenderColorTexture(rhi, size, size)
      ],
      RenderBufferDepthFormat.Depth,
      1
    );

    this.multiRenderTarget = multiRenderTarget;
    this.mrtRenderPass = new MRTRenderPass("default", 0, multiRenderTarget);
    this.mainRenderPass = new MainRenderPass("default", 0);
  }

  /**
   * 默认的 RenderPass
   */
  get defaultRenderPass() {
    return this.mrtRenderPass;
  }

  /**
   * 不透明对象的渲染队列
   * @member {RenderQueue}
   * @readonly
   */
  get opaqueQueue() {
    return this._opaqueQueue;
  }

  /**
   * 释放内部资源
   */
  destroy() {}

  /**
   * 执行场景渲染
   */
  render() {
    const camera = this._camera;
    const opaqueQueue = this._opaqueQueue;

    //-- 清空内部状态
    opaqueQueue.clear();

    //-- 遍历 Scene Graph，收集所有激活的渲染对象组件
    const scene = camera.scene;
    scene.visitSceneGraph(this);

    //-- 执行渲染队列
    opaqueQueue.sortByTechnique();

    this._drawRenderPass(this.defaultRenderPass, camera);
    this.mainRenderPass.setDiffuse(this.mrtRenderPass.renderTarget.getColorTexture(0));
    this.mainRenderPass.setNormal(this.mrtRenderPass.renderTarget.getColorTexture(2));
    this.mainRenderPass.setShiniess(this.mrtRenderPass.renderTarget.getColorTexture(1));
    this.mainRenderPass.setPosition(this.mrtRenderPass.renderTarget.getColorTexture(3));
    this._drawRenderPass(this.mainRenderPass, camera);
  }

  _drawRenderPass(pass, camera) {
    pass.preRender(camera, this.opaqueQueue, null);

    const rhi = camera.renderHardware;
    rhi.activeRenderTarget(pass.renderTarget, camera); // keep require rendertarget in case of GC

    if (pass.enabled) {
      rhi.clearRenderTarget(pass.clearMode, pass.clearParam);
      if (pass.renderOverride) {
        pass.render(camera, this.opaqueQueue, null);
      } else {
        this.opaqueQueue.render(camera, pass.replaceMaterial, pass.mask);
      }
    }
    rhi.blitRenderTarget(pass.renderTarget);
    pass.postRender(camera, this.opaqueQueue, null);
  }

  pushPrimitive(nodeAbility, primitive, mtl) {
    this._opaqueQueue.pushPrimitive(nodeAbility, primitive, mtl);
  }

  pushSprite(nodeAbility, positionQuad, uvRect, tintColor, texture, renderMode, camera) {}

  acceptNode(node) {
    return node.isActive;
  }

  acceptAbility(nodeAbility) {
    if (nodeAbility.enabled && nodeAbility.isRenderable) {
      let culled = false;

      // distance cull
      if (nodeAbility.cullDistanceSq > 0) {
        const distanceSq = vec3.squaredDistance(this._camera.eyePos, nodeAbility.node.worldPosition);
        culled = nodeAbility.cullDistanceSq < distanceSq;
      }

      if (!culled) {
        nodeAbility.render(this._camera);
      }
    }
  }
}
