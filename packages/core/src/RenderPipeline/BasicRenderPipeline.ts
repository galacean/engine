import { Vector4 } from "@oasis-engine/math";
import { ClearMode } from "../base";
import { Camera } from "../Camera";
import { Component } from "../Component";
import { Layer } from "../Layer";
import { RenderQueueType } from "../material";
import { Material } from "../material/Material";
import { BlendFactor, BlendOperation, CullMode, Shader } from "../shader";
import { TextureCubeFace } from "../texture/enums/TextureCubeFace";
import { RenderTarget } from "../texture/RenderTarget";
import { RenderContext } from "./RenderContext";
import { RenderElement } from "./RenderElement";
import { RenderPass } from "./RenderPass";
import { RenderQueue } from "./RenderQueue";
import { SeparateSpritePass } from "./SeparateSpritePass";

/**
 * Basic render pipeline.
 */
export class BasicRenderPipeline {
  _defaultSpriteMaterial: Material;
  protected _camera: Camera;
  private _queue: RenderQueue;
  private _defaultPass: RenderPass;
  protected _renderPassArray: Array<RenderPass>;
  private _canvasDepthPass;
  private _separateSpritePass;

  /**
   * Create a basic render pipeline.
   * @param camera - Camera
   */
  constructor(camera: Camera) {
    this._camera = camera;
    this._queue = new RenderQueue();

    this._renderPassArray = [];
    this._defaultPass = new RenderPass("default", 0, null, null, 0);
    this.addRenderPass(this._defaultPass);

    // TODO: remove in next version.
    const material = (this._defaultSpriteMaterial = new Material(camera.engine, Shader.find("Sprite")));
    const target = material.renderState.blendState.targetBlendState;
    target.sourceColorBlendFactor = target.sourceAlphaBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
    material.renderState.depthState.writeEnabled = false;
    material.renderQueueType = RenderQueueType.Transparent;
    material.renderState.rasterState.cullMode = CullMode.Off;
  }

  /**
   * Default render pass.
   */
  get defaultRenderPass() {
    return this._defaultPass;
  }

  /**
   * Add render pass.
   * @param nameOrPass - The name of this Pass or RenderPass object. When it is a name, the following parameters need to be provided
   * @param priority - Priority, less than 0 before the default pass, greater than 0 after the default pass
   * @param renderTarget - The specified Render Target
   * @param replaceMaterial -  Replaced material
   * @param mask - Perform bit and operations with Entity.Layer to filter the objects that this Pass needs to render
   * @param clearParam - Clear the background color of renderTarget
   */
  addRenderPass(
    nameOrPass: string | RenderPass,
    priority: number = null,
    renderTarget: RenderTarget = null,
    replaceMaterial: Material = null,
    mask: Layer = null,
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
   * Remove render pass by name or render pass object.
   * @param nameOrPass - Render pass name or render pass object
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
   * Get render pass by name.
   * @param  name - Render pass name
   */
  getRenderPass(name: string) {
    for (let i = 0, len = this._renderPassArray.length; i < len; i++) {
      const pass = this._renderPassArray[i];
      if (pass.name === name) return pass;
    }

    return null;
  }

  /**
   * Render queue.
   */
  get queue(): RenderQueue {
    return this._queue;
  }

  /**
   * Destroy internal resources.
   */
  destroy() {}

  /**
   * Perform scene rendering.
   * @param context - Render context
   * @param cubeFace - Render surface of cube texture
   */
  render(context: RenderContext, cubeFace?: TextureCubeFace) {
    const camera = this._camera;
    const queue = this._queue;

    queue.clear();

    camera.engine._componentsManager.callRender(context);

    queue.sort(camera.entity.transform.worldPosition);

    if (this._canvasDepthPass) this._canvasDepthPass.enabled = false;

    if (this._separateSpritePass && this._separateSpritePass.isUsed) {
      // If the default rendertarget is not canvas, you need to draw on the canvas again to ensure that there is depth information
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
      this._drawRenderPass(this._renderPassArray[i], camera, cubeFace);
    }
  }

  private _drawRenderPass(pass: RenderPass, camera: Camera, cubeFace?: TextureCubeFace) {
    pass.preRender(camera, this.queue);

    if (pass.enabled) {
      const rhi = camera.scene.engine._hardwareRenderer;
      const renderTarget = camera.renderTarget || pass.renderTarget;
      rhi.activeRenderTarget(renderTarget, camera);
      rhi.setRenderTargetFace(renderTarget, cubeFace);
      rhi.clearRenderTarget(camera.engine, pass.clearMode, pass.clearParam);

      if (pass.renderOverride) {
        pass.render(camera, this.queue);
      } else {
        this.queue.render(camera, pass.replaceMaterial, pass.mask);
      }

      rhi.blitRenderTarget(renderTarget);
    }

    pass.postRender(camera, this.queue);
  }

  /**
   * Push a render element to the render queue.
   * @param element - Render element
   */
  pushPrimitive(element: RenderElement) {
    this._queue.pushPrimitive(element);
  }

  pushSprite(component: Component, positionQuad, uvRect, tintColor, texture, renderMode, camera: Camera) {
    if ((component as any).separateDraw) {
      if (!this._separateSpritePass) {
        this._separateSpritePass = new SeparateSpritePass();
        this.addRenderPass(this._separateSpritePass);
      }

      this._separateSpritePass.pushSprite(component, positionQuad, uvRect, tintColor, texture, renderMode, camera);
      return;
    }

    this.queue.pushSprite(component, positionQuad, uvRect, tintColor, texture, renderMode, camera);
  }
}
