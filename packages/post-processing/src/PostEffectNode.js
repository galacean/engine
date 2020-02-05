
import { PostEffectMaterial } from './PostEffectMaterial';
import { ClearMode } from '@alipay/o3-base';

/**
 * 支持以树状方式组织后处理效果的渲染流程，也可退化为列表方式
 * 约定为“深度优先”的方式遍历
 * @private
 */
export class PostEffectNode {

  /**
   * 构造函数
   * @param {PostEffectNode} parent 父节点
   * @param {Object} shaderConfig Fragment Shader 相关配置
   * @property {string} shaderConfig.source Fragment Shader 代码
   * @property {object} shaderConfig.uniforms 需要的 Unifrom 配置对象
   * @property {object} shaderConfig.macros 宏定义配置对象
   */
  constructor( name, renderTarget, parent, shaderConfig ){

    // properites
    this.name = name;
    this.enabled = true;
    this.parent = parent;
    this.children = [];

    // 将父节点的 Render Target，经过计算，存储到这个 Render Target 之上
    this.renderTarget = renderTarget;

    // 创建材质对象
    if( shaderConfig ){

      this.material = new PostEffectMaterial( name, shaderConfig );

    }
    else{

      this.material = null;

    }

    // 链接父子关系
    if( parent ){

      parent.children.push( this );

    }

  }

  /**
   * 添加一个子节点
   * @param {PostEffectNode} effect 子节点对象
   */
  attachChild( effect ){

    if( effect.parent ){

      const p = effect.parent.children.indexOf( effect );
      if( p != -1 ){

        effect.parent.children.splice( p, 1 );

      }

    }

    effect.parent = this;
    this.children.push( effect );

  }

  /**
   * 获取当前节点所需要处理的源数据 Render Target
   * @description 允许构造“空节点”作为管理器，在这种情况下自身没有 RT， 需要向上递归查找 RT 作为源数据
   */
  getSourceRenderTarget(){

    if( this.parent.renderTarget ) {

      return this.parent.renderTarget;

    }
    else{

      return this.parent.getSourceRenderTarget();

    }

  }

  /**
   * 在绘制之前，设置材质的参数；静态参数可以在创建节点时配置好
   */
  setupMaterial( camera ){

    const sourceRT = this.getSourceRenderTarget();
    this.material.setValue( 's_sourceRT', sourceRT.texture );

  }

  /**
   * 获得这个节点以下所有处理之后的结果节点，供后续效果链接用
   */
  getResultNode(){

    if( this.enabled ){

      const children = this.children;
      const nChildren = children.length;
      return nChildren ? children[ nChildren - 1 ].getResultNode() : this;
      // let result = this;
      // for( let i = 0, len = this.children.length; i < len; i++ ){

      //   result = this.children[i].getResultNode(  );

      // }

      // return result;

    }else{

      return this.parent;

    }

  }

  /**
   * 执行自身&所有子节点的处理
   * @param {PostProcessFeature} feature 后处理管理器
   * @param {ACamera} camera 摄像机对象
   */
  draw( feature, camera ){

    if( !this.enabled ) {

      if( this.parent ){

        return this.parent;

      }
      else{

        return this;

      }

    };

    const rhi = camera.renderHardware;
    let result = this.renderTarget;

    // 执行自身的绘制 （root 节点没有材质，不需要绘制）
    if( this.parent && this.material ){

      const destRT = this.renderTarget;
      const screenQuad = feature.quads.screen;

      this.setupMaterial( camera );
      rhi.activeRenderTarget( destRT, camera );
      rhi.clearRenderTarget( ClearMode.SOLID_COLOR, destRT.clearColor );
      rhi.drawPrimitive( screenQuad.primitive, this.material );

    }

    // 执行所有子节点的绘制
    for( let i = 0, len = this.children.length; i < len; i++ ){

      result = this.children[i].draw( feature, camera );

    }

    return result;

  }

};
