import { ClearMode } from '@alipay/r3-base';
import { RenderPass } from '@alipay/r3-renderer-basic';

/**
 * 后处理 RenderPass
 * @private
 */
export class PostProcessRenderPass extends RenderPass {

  /**
   * 构造函数
   * @param {PostProcessFeature} feature 场景插件对象
   * @param {object} config 配置项
   */
  constructor( feature, config ) {

    super( 'postProcessing', 2 );
    this.renderOverride = true;
    this.feature = feature;
    this.clearMode = config.clearMode !== undefined ? config.clearMode : ClearMode.COLOR_ONLY;
    this.renderTarget = feature.originRenderTarget;

  }

  /**
   * Pass 渲染前调用
   * @param {ACamera} camera 摄像机
   */
  preRender( camera ) {

    // 确保画布清除颜色一致
    this.clearParam = camera.sceneRenderer.defaultRenderPass.clearParam;

  }

  /**
   * 自定义渲染
   * @param {ACamera} camera 相机
   */
  render( camera ) {

    if( this.feature.empty ) return;

    const feature = this.feature;
    const root = this.feature.root;
    const rhi = camera.renderHardware;

    // 执行所有的 Post Process
    const result = root.draw( feature, camera );
    const sceneColor = root.renderTarget;

    // 将执行结果，拷贝到屏幕缓冲
    feature.copyMtl.setValue( 's_resultRT', result.texture );
    feature.copyMtl.setValue( 's_sceneRT', sceneColor.texture );

    rhi.activeRenderTarget( feature.originRenderTarget, camera );
    rhi.drawPrimitive( feature.quads.screen.primitive, feature.copyMtl );

  }

}
