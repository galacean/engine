import { RenderTarget } from '@alipay/o3-material';
import { PostEffectNode } from './PostEffectNode';
import { SMAAEdgesPassNode } from './nodes/SMAAEdgesPassNode';
import { SMAAWeightPassNode } from './nodes/SMAAWeightPassNode';
import { SMAACombinePassNode } from './nodes/SMAACombinePassNode';

/**
 * SMAA 后处理效果
 * @extends PostEffectNode
 * @private
 */
export class SMAAEffect extends PostEffectNode {

  /**
   * @constructor
   * @param {Object} manager 管理器
   * @param {Object} camera 相机
   */
  constructor( manager, props ){

    super( 'SMAA', null, null, null );

    const rtWidth = 1023;
    const rtHeight = 1024;
    const rtColor = [ 0.0, 0.0, 0.0, 0.0 ];
    const resolution = [ 1 / 100, 1 / 100 ];

    const edgesRT = new RenderTarget( 'scene_edgesRT', {
      width: rtWidth,
      height: rtHeight,
      clearColor: rtColor
    } );

    const weightRT = new RenderTarget( 'scene_weightRT', {
      width: rtWidth,
      height: rtHeight,
      clearColor: rtColor
    } );

    const SMAACombineRT = new RenderTarget( 'scene_SMAACombineRT', {
      width: rtWidth,
      height: rtHeight,
      clearColor: rtColor
    } );

    // 第一步：提取检测到的边缘信息
    const edgesPass = new SMAAEdgesPassNode( 'edges', edgesRT, this, resolution );
    this._edgesPass = edgesPass;


    // 第二步：通过边缘信息，计算权重因子
    const weightPass = new SMAAWeightPassNode( 'weight', weightRT, edgesPass, resolution );
    this._weightPass = weightPass;


    // 第三步：将原始图像与SMAA权重因子进行混合
    const SMAACombinePass = new SMAACombinePassNode( 'SMAACombine', SMAACombineRT, this, weightRT.texture, resolution );
    this._SMAACombinePass = SMAACombinePass;

    this.rtWidth = rtWidth;
    this.rtHeight = rtHeight;

  }

  draw( feature, camera ) {

    const parentRT = this.getSourceRenderTarget();
    const sourceWidth = parentRT && parentRT.width;
    const sourceHeight = parentRT && parentRT.height;
    const rtWidth = sourceWidth || camera.viewport[2];
    const rtHeight = sourceHeight || camera.viewport[3];

    if( this.rtWidth !== rtWidth || this.rtHeight !== rtHeight ) {

      this.rtWidth = rtWidth;
      this.rtHeight = rtHeight;
      const rtColor = [ 0, 0, 0, 0 ];
      const resolution = [ 1 / rtWidth, 1 / rtHeight ];
      this._edgesPass.resolution = resolution;
      this._weightPass.resolution = resolution;
      this._SMAACombinePass.resolution = resolution;

      this._edgesPass.renderTarget = new RenderTarget( 'scene_edgesRT', {
        width: rtWidth,
        height: rtHeight,
        clearColor: rtColor
      } );

      this._weightPass.renderTarget = new RenderTarget( 'scene_weightRT', {
        width: rtWidth,
        height: rtHeight,
        clearColor: rtColor
      } );

      this._SMAACombinePass.renderTarget = new RenderTarget( 'scene_SMAACombineRT', {
        width: rtWidth,
        height: rtHeight,
        clearColor: rtColor
      } );

      this._SMAACombinePass.sourceColor = this._weightPass.renderTarget.texture;

    }

    return super.draw( feature, camera );

  }

};
