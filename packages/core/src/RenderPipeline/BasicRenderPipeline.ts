import { ClearMode, MaskList, MaterialType } from "../base";
import { Camera } from "../Camera";
import { SceneVisitor } from "../SceneVisitor";
import { Component } from "../Component";
import { RenderPass } from "./RenderPass";
import { RenderQueue } from "./RenderQueue";
import { SeparateSpritePass } from "./SeparateSpritePass";
import { Vector4 } from "@alipay/o3-math";
import { Primitive } from "../graphic";

/** @todo: monorepo circle dependence */
type RenderTarget = any;
type Material = any;

/**
 * 使用指定的CameraComponent对象，渲染当前场景中的所有可见对象
 * @class
 */
export class BasicRenderPipeline extends SceneVisitor {
  protected _camera: Camera;
  private _opaqueQueue: RenderQueue;
  private _transparentQueue: RenderQueue;
  private _defaultPass: RenderPass;
  protected _renderPassArray: Array<RenderPass>;
  private _canvasDepthPass;
  private _separateSpritePass;

  /**
   * 构造函数
   * @param {Camera} camera 摄像机对象
   */
  constructor(camera) {
    super();

    this._camera = camera;
    this._opaqueQueue = new RenderQueue(); // 不透明对象的渲染队列
    this._transparentQueue = new RenderQueue(); // 透明对象的渲染队列

    this._renderPassArray = [];
    this._defaultPass = new RenderPass("default", 0, null, null, 0);
    this.addRenderPass(this._defaultPass);
  }

  /**
   * 默认的 RenderPass
   */
  get defaultRenderPass() {
    return this._defaultPass;
  }

  /**
   * 添加一个 Render Pass
   * @param {string|RenderPass} nameOrPass 这个 Pass 的名称或者 RenderPass 对象，当为名称时需提供以下参数
   * @param {number} priority 优先级，小于0在默认Pass之前，大于0在默认Pass之后
   * @param {RenderTarget} renderTarget 指定的 Render Target
   * @param {Material} replaceMaterial 替换模型的默认材质
   * @param {MaskList} mask 与 Component.renderPassFlag 进行 bit and 操作，对这个 Pass 需要渲染的对象进行筛选
   * @param clearParam 清除renderTarget的背景颜色
   */
  addRenderPass(
    nameOrPass: string | RenderPass,
    priority: number = null,
    renderTarget: RenderTarget = null,
    replaceMaterial: Material = null,
    mask: MaskList = null,
    clearParam = new Vector4(0, 0, 0, 0)
  ) {
    if (typeof nameOrPass === "string") {
      const renderPass = new RenderPass(nameOrPass, priority, renderTarget, replaceMaterial, mask, clearParam);
      this._renderPassArray.push(renderPass);
    } else if (nameOrPass instanceof RenderPass) {
      this._renderPassArray.push(nameOrPass);
    }

    this._renderPassArray.sort(function (p1, p2) {
      return p1.priority - p2.priority;
    });
  }

  /**
   * 通过名称或 RenderPass 对象移除 RenderPass
   * @param {string | RenderPass} nameOrPass RenderPass 名称
   */
  removeRenderPass(nameOrPass: string | RenderPass): void {
    let pass: RenderPass;
    if (typeof nameOrPass === "string") pass = this.getRenderPass(nameOrPass);
    else if (nameOrPass instanceof RenderPass) pass = nameOrPass;
    if (pass) {
      const idx = this._renderPassArray.indexOf(pass);
      this._renderPassArray.splice(idx, 1);
    }
  }

  /**
   * 通过名称获取 RenderPass
   * @param {string} name RenderPass 名称
   */
  getRenderPass(name: string) {
    for (let i = 0, len = this._renderPassArray.length; i < len; i++) {
      const pass = this._renderPassArray[i];
      if (pass.name === name) return pass;
    }

    return null;
  }

  /**
   * 不透明对象的渲染队列
   * @member {RenderQueue}
   * @readonly
   */
  get opaqueQueue(): RenderQueue {
    return this._opaqueQueue;
  }

  /**
   * 透明对象的渲染队列
   * @member {RenderQueue}
   * @readonly
   */
  get transparentQueue(): RenderQueue {
    return this._transparentQueue;
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
    if (!camera.scene.engine._hardwareRenderer) {
      return;
    }
    const opaqueQueue = this._opaqueQueue;
    const transparentQueue = this._transparentQueue;

    //-- 清空内部状态
    opaqueQueue.clear();
    transparentQueue.clear();

    const scene = camera.scene;
    scene._componentsManager.callRender(camera);
    //-- 执行渲染队列
    opaqueQueue.sortByTechnique();
    transparentQueue.sortByDistance(camera.entity.transform.worldPosition);

    //-- 为sprite提供canvas上的深度信息
    if (this._canvasDepthPass) this._canvasDepthPass.enabled = false;

    if (this._separateSpritePass && this._separateSpritePass.isUsed) {
      // 如果默认的rendertarget不是canvas的话，就需要在canvas上再绘制一遍确保有深度信息
      if (this._defaultPass.renderTarget) {
        if (!this._canvasDepthPass) {
          this._canvasDepthPass = new RenderPass("CanvasDepthRenderPass", 0, null, null, 0);
          this._canvasDepthPass.clearMode = ClearMode.DONT_CLEAR;
          this.addRenderPass(this._canvasDepthPass);
        }
        this._canvasDepthPass.enabled = true;
      }
    }

    for (let i = 0, len = this._renderPassArray.length; i < len; i++) {
      this._drawRenderPass(this._renderPassArray[i], camera);
    }
  }

  private _drawRenderPass(pass: RenderPass, camera: Camera) {
    pass.preRender(camera, this.opaqueQueue, this.transparentQueue);

    const rhi = camera.scene.engine._hardwareRenderer;
    const renderTarget = camera.renderTarget || pass.renderTarget;
    rhi.activeRenderTarget(renderTarget, camera); // keep require rendertarget in case of GC

    if (pass.enabled) {
      rhi.clearRenderTarget(pass.clearMode, pass.clearParam);

      if (pass.renderOverride) {
        pass.render(camera, this.opaqueQueue, this.transparentQueue);
      } else {
        this.opaqueQueue.render(camera, pass.replaceMaterial, pass.mask);
        this.transparentQueue.render(camera, pass.replaceMaterial, pass.mask);
      }
    }

    rhi.blitRenderTarget(renderTarget);
    pass.postRender(camera, this.opaqueQueue, this.transparentQueue);
  }

  /**
   * 将一个 Primitive 对象添加到渲染队列
   * @param {Component} component
   * @param {Primitive} primitive
   * @param {Material} mtl
   */
  pushPrimitive(component: Component, primitive: Primitive, mtl: Material) {
    if (mtl.renderType === MaterialType.TRANSPARENT) {
      this._transparentQueue.pushPrimitive(component, primitive, mtl);
    } else {
      this._opaqueQueue.pushPrimitive(component, primitive, mtl);
    }
  }

  /**
   * 将一个 Sprite 绘制信息添加到渲染队列
   * @param {Component} component
   * @param {Object} positionQuad  Sprite四个顶点的位置
   * @param {Object} uvRect        Sprite在texture上的纹理坐标
   * @param {vec4}   tintColor     颜色
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {Camera}   camera        相机信息
   */
  pushSprite(component: Component, positionQuad, uvRect, tintColor, texture, renderMode, camera: Camera) {
    if ((component as any).separateDraw) {
      if (!this._separateSpritePass) {
        this._separateSpritePass = new SeparateSpritePass();
        this.addRenderPass(this._separateSpritePass);
      }

      this._separateSpritePass.pushSprite(component, positionQuad, uvRect, tintColor, texture, renderMode, camera);
      return;
    }

    this._transparentQueue.pushSprite(component, positionQuad, uvRect, tintColor, texture, renderMode, camera);
  }
}
