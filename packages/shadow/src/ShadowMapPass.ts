import { RenderPass } from "@alipay/o3-core";

/**
 * RednerPass 对象
 * @private
 */
export class ShadowMapPass extends RenderPass {
  public light;
  /**
   * RenderPass 构造函数
   * @param {string} name 这个 Pass 的名称
   * @param {number} priority 优先级，小于0在默认Pass之前，大于0在默认Pass之后
   * @param {RenderTarget} renderTarget 指定的 Render Target
   * @param {Material} replaceMaterial 替换模型的默认材质
   * @param {number} mask 与 Component.renderPassFlag 进行 bit and 操作，对这个 Pass 需要渲染的对象进行筛选
   * @param {ALight} light 需要生成 ShadowMap 的光源
   */
  constructor(name, priority, renderTarget, replaceMaterial, mask, light) {
    super(name, priority, renderTarget, replaceMaterial, mask);
    this.light = light;
  }

  /**
   * Pass 渲染前调用
   * @param {ACamera} camera 相机
   * @param {RenderQueue} opaqueQueue 不透明物体渲染队列
   * @param {RenderQueue} transparentQueue 透明物体渲染队列
   */
  preRender(camera, opaqueQueue, transparentQueue) {
    // 光源视点 VP 矩阵
    this.replaceMaterial.setValue("u_viewMatFromLight", this.light.viewMatrix);
    this.replaceMaterial.setValue("u_projMatFromLight", this.light.shadow.projectionMatrix);
  }
}
