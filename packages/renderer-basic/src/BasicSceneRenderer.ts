import { vec3 } from "@alipay/o3-math";
import { RenderPass } from "./RenderPass";
import { RenderQueue } from "./RenderQueue";
import { SceneVisitor, NodeAbility, Node, ACamera } from "@alipay/o3-core";
import { SeparateSpritePass } from "./SeparateSpritePass";
import { MaterialType, ClearMode, MaskList } from "@alipay/o3-base";
import { RenderTarget, Material } from "@alipay/o3-material";

/**
 * 使用指定的CameraComponent对象，渲染当前场景中的所有可见对象
 * @class
 */
export class BasicSceneRenderer extends SceneVisitor {
  protected _camera: ACamera;
  private _opaqueQueue: RenderQueue;
  private _transparentQueue: RenderQueue;
  private _defaultPass: RenderPass;
  private _renderPassArray: Array<RenderPass>;
  private _canvasDepthPass;
  private _separateSpritePass;

  /**
   * 构造函数
   * @param {ACamera} camera 摄像机对象
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
   * @param {MaskList} mask 与 NodeAbility.renderPassFlag 进行 bit and 操作，对这个 Pass 需要渲染的对象进行筛选
   */
  addRenderPass(
    nameOrPass: string | RenderPass,
    priority: number = null,
    renderTarget: RenderTarget = null,
    replaceMaterial: Material = null,
    mask: MaskList = null
  ) {
    if (typeof nameOrPass === "string") {
      const renderPass = new RenderPass(nameOrPass, priority, renderTarget, replaceMaterial, mask);
      this._renderPassArray.push(renderPass);
    } else if (nameOrPass instanceof RenderPass) {
      this._renderPassArray.push(nameOrPass);
    }

    this._renderPassArray.sort(function(p1, p2) {
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
    const opaqueQueue = this._opaqueQueue;
    const transparentQueue = this._transparentQueue;

    //-- 清空内部状态
    opaqueQueue.clear();
    transparentQueue.clear();

    //-- 遍历 Scene Graph，收集所有激活的渲染对象组件
    const scene = camera.scene;
    scene.visitSceneGraph(this);

    //-- 执行渲染队列
    opaqueQueue.sortByTechnique();
    transparentQueue.sortByDistance(camera.eyePos);

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

  private _drawRenderPass(pass: RenderPass, camera: ACamera) {
    pass.preRender(camera, this.opaqueQueue, this.transparentQueue);

    const rhi = camera.renderHardware;
    rhi.activeRenderTarget(pass.renderTarget, camera); // keep require rendertarget in case of GC

    if (pass.enabled) {
      rhi.clearRenderTarget(pass.clearMode, pass.clearParam);

      if (pass.renderOverride) {
        pass.render(camera, this.opaqueQueue, this.transparentQueue);
      } else {
        this.opaqueQueue.render(camera, pass.replaceMaterial, pass.mask);
        this.transparentQueue.render(camera, pass.replaceMaterial, pass.mask);
      }
    }

    rhi.blitRenderTarget(pass.renderTarget);
    pass.postRender(camera, this.opaqueQueue, this.transparentQueue);
  }

  /**
   * 将一个 Primitive 对象添加到渲染队列
   * @param {NodeAbility} nodeAbility
   * @param {Primitive} primitive
   * @param {Material} mtl
   */
  pushPrimitive(nodeAbility: NodeAbility, primitive, mtl: Material) {
    if (mtl.renderType === MaterialType.TRANSPARENT) {
      this._transparentQueue.pushPrimitive(nodeAbility, primitive, mtl);
    } else {
      this._opaqueQueue.pushPrimitive(nodeAbility, primitive, mtl);
    }
  }

  /**
   * 将一个 Sprite 绘制信息添加到渲染队列
   * @param {NodeAbility} nodeAbility
   * @param {Object} positionQuad  Sprite四个顶点的位置
   * @param {Object} uvRect        Sprite在texture上的纹理坐标
   * @param {vec4}   tintColor     颜色
   * @param {Texture}   texture    纹理信息
   * @param {String}    renderMode    绘制方式， '2D' 或者 '3D'
   * @param {ACamera}   camera        相机信息
   */
  pushSprite(nodeAbility: NodeAbility, positionQuad, uvRect, tintColor, texture, renderMode, camera) {
    if ((nodeAbility as any).separateDraw) {
      if (!this._separateSpritePass) {
        this._separateSpritePass = new SeparateSpritePass();
        this.addRenderPass(this._separateSpritePass);
      }

      this._separateSpritePass.pushSprite(nodeAbility, positionQuad, uvRect, tintColor, texture, renderMode, camera);
      return;
    }

    this._transparentQueue.pushSprite(nodeAbility, positionQuad, uvRect, tintColor, texture, renderMode, camera);
  }

  /**
   * SceneVisitor 的 Node 访问接口
   */
  acceptNode(node: Node) {
    return node.isActive;
  }

  /**
   * SceneVisitor 的 Node 组件访问接口
   */
  acceptAbility(nodeAbility: NodeAbility) {
    if (nodeAbility.enabled && nodeAbility.isRenderable) {
      let culled = false;

      // distance cull
      if (nodeAbility.cullDistanceSq > 0) {
        const distanceSq = vec3.squaredDistance(this._camera.eyePos, nodeAbility.node.worldPosition);
        culled = nodeAbility.cullDistanceSq < distanceSq;
      }

      if (!culled) {
        (nodeAbility as any).render(this._camera);
      }
    }
  }
}
