
import { SceneFeature } from '@alipay/r3-core';
import { DataType } from '@alipay/r3-base';
import { RenderTarget } from '@alipay/r3-material';

import { ScreenQuad } from './ScreenQuad';
import { RenderTargetPool } from './RenderTargetPool';
import { PostEffectNode } from './PostEffectNode';
import { PostEffectMaterial } from './PostEffectMaterial';
import { PostProcessRenderPass } from './PostProcessRenderPass';

import CopyShader from './shaders/Copy.glsl';


/**
 * 后处理管理器（场景插件）
 */
export class PostProcessFeature extends SceneFeature {

  /**
   * 构造函数
   */
  constructor(){

    super();

    this.empty = true;

    // Render Target Pool
    this.renderTargets = new RenderTargetPool();

    // 绘制全屏矩形公用的几何体
    this.quads = {};
    this.quads.screen = new ScreenQuad();

  }

  /**
   * 初始化，创建内部的 Render Targets
   * @param {number} w 宽度
   * @param {number} h 高度
   * @param {object} renderPassconfig 配置项
   */
  initRT( w, h, renderPassconfig = {} ){

    this.width = w || 1024;
    this.height = h || 1024;

    // 创建根节点·
    const sceneRT = new RenderTarget( 'scene', { width:this.width, height:this.height, clearColor: [ 0.0, 0.0, 0.0, 1.0 ] } );

    this.root = new PostEffectNode( 'root', sceneRT );
    this.copyMtl = new PostEffectMaterial( 'copy', {
      source:CopyShader,
      uniforms : {
        s_resultRT: {
          name: 's_resultRT',
          type: DataType.SAMPLER_2D,
        },
        s_sceneRT: {
          name: 's_sceneRT',
          type: DataType.SAMPLER_2D,
        }
      } } );

    this._renderPass = new PostProcessRenderPass( this, renderPassconfig );
    this._addPass = false;

  }

  /**
   * 添加一个后处理效果
   * @param {PostEffectNode} effect 后处理效果对象
   */
  addEffect( effect ){

    this.empty = false;
    const lastResult = this.root.getResultNode();
    lastResult.attachChild( effect );

  }

  /**
   * SceneFeature 回调
   */
  preRender( scene, camera ) {

    if( this.empty ) return;

    if( !this._addPass ){

      this._addPass = true;
      camera.sceneRenderer.addRenderPass( this._renderPass );

      // 将整个场景绘制到根节点
      const pass = camera.sceneRenderer.defaultRenderPass;
      this.originRenderTarget = pass.renderTarget;
      const rootRT = this.root.renderTarget;
      rootRT.clearColor = pass.clearParam;
      pass.renderTarget = this.root.renderTarget;

    }

  }

};
