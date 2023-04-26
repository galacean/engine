import { Vector2 } from "@galacean/engine-math";
import { SpriteMask } from "../2d";
import { Background } from "../Background";
import { Camera } from "../Camera";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { BackgroundMode } from "../enums/BackgroundMode";
import { BackgroundTextureFillMode } from "../enums/BackgroundTextureFillMode";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Layer } from "../Layer";
import { Material } from "../material";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { Shader } from "../shader/Shader";
import { ShaderPass } from "../shader/ShaderPass";
import { RenderState } from "../shader/state/RenderState";
import { CascadedShadowCasterPass } from "../shadow/CascadedShadowCasterPass";
import { ShadowType } from "../shadow/enum/ShadowType";
import { RenderTarget, TextureCubeFace } from "../texture";
import { PipelineStage } from "./enums/PipelineStage";
import { RenderContext } from "./RenderContext";
import { RenderData } from "./RenderData";
import { RenderPass } from "./RenderPass";
import { RenderQueue } from "./RenderQueue";

/**
 * Basic render pipeline.
 */
export class BasicRenderPipeline {
  private static _shadowCasterPipelineStageTagValue = PipelineStage.ShadowCaster;
  private static _forwardPipelineStageTagValue = PipelineStage.Forward;

  /** @internal */
  _opaqueQueue: RenderQueue;
  /** @internal */
  _transparentQueue: RenderQueue;
  /** @internal */
  _alphaTestQueue: RenderQueue;
  /** @internal */
  _allSpriteMasks: DisorderedArray<SpriteMask> = new DisorderedArray();

  private _camera: Camera;
  private _defaultPass: RenderPass;
  private _renderPassArray: Array<RenderPass>;
  private _lastCanvasSize = new Vector2();
  private _cascadedShadowCaster: CascadedShadowCasterPass;

  /**
   * Create a basic render pipeline.
   * @param camera - Camera
   */
  constructor(camera: Camera) {
    this._camera = camera;
    const { engine } = camera;
    this._opaqueQueue = new RenderQueue(engine);
    this._alphaTestQueue = new RenderQueue(engine);
    this._transparentQueue = new RenderQueue(engine);
    this._cascadedShadowCaster = new CascadedShadowCasterPass(camera);

    this._renderPassArray = [];
    this._defaultPass = new RenderPass("default", 0, null, null, 0);
    this.addRenderPass(this._defaultPass);
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
   */
  addRenderPass(
    nameOrPass: string | RenderPass,
    priority: number = null,
    renderTarget: RenderTarget = null,
    replaceMaterial: Material = null,
    mask: Layer = null
  ) {
    if (typeof nameOrPass === "string") {
      const renderPass = new RenderPass(nameOrPass, priority, renderTarget, replaceMaterial, mask);
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
   * Destroy internal resources.
   */
  destroy(): void {
    this._opaqueQueue.destroy();
    this._alphaTestQueue.destroy();
    this._transparentQueue.destroy();
    this._allSpriteMasks = null;
    this._renderPassArray = null;
    this._defaultPass = null;
    this._camera = null;
  }

  /**
   * Perform scene rendering.
   * @param context - Render context
   * @param cubeFace - Render surface of cube texture
   * @param mipLevel - Set mip level the data want to write
   */
  render(context: RenderContext, cubeFace?: TextureCubeFace, mipLevel?: number) {
    const camera = this._camera;
    const scene = camera.scene;
    const opaqueQueue = this._opaqueQueue;
    const alphaTestQueue = this._alphaTestQueue;
    const transparentQueue = this._transparentQueue;

    camera.engine._spriteMaskManager.clear();

    context.pipelineStageTagValue = BasicRenderPipeline._shadowCasterPipelineStageTagValue;
    if (scene.castShadows && scene._sunLight?.shadowType !== ShadowType.None) {
      this._cascadedShadowCaster._render(context);
    }
    opaqueQueue.clear();
    alphaTestQueue.clear();
    transparentQueue.clear();
    this._allSpriteMasks.length = 0;

    context.applyVirtualCamera(camera._virtualCamera);

    context.pipelineStageTagValue = BasicRenderPipeline._forwardPipelineStageTagValue;
    this._callRender(context);
    opaqueQueue.sort(RenderQueue._compareFromNearToFar);
    alphaTestQueue.sort(RenderQueue._compareFromNearToFar);
    transparentQueue.sort(RenderQueue._compareFromFarToNear);

    for (let i = 0, len = this._renderPassArray.length; i < len; i++) {
      this._drawRenderPass(context, this._renderPassArray[i], camera, cubeFace, mipLevel);
    }
  }

  private _drawRenderPass(
    context: RenderContext,
    pass: RenderPass,
    camera: Camera,
    cubeFace?: TextureCubeFace,
    mipLevel?: number
  ) {
    pass.preRender(camera, this._opaqueQueue, this._alphaTestQueue, this._transparentQueue);

    if (pass.enabled) {
      const { engine, scene } = camera;
      const { background } = scene;
      const rhi = engine._hardwareRenderer;
      const renderTarget = camera.renderTarget || pass.renderTarget;
      rhi.activeRenderTarget(renderTarget, camera.viewport, mipLevel);
      renderTarget?._setRenderTargetInfo(cubeFace, mipLevel);
      const clearFlags = pass.clearFlags ?? camera.clearFlags;
      const color = pass.clearColor ?? background.solidColor;
      if (clearFlags !== CameraClearFlags.None) {
        rhi.clearRenderTarget(camera.engine, clearFlags, color);
      }

      if (pass.renderOverride) {
        pass.render(camera, this._opaqueQueue, this._alphaTestQueue, this._transparentQueue);
      } else {
        this._opaqueQueue.render(camera, pass.mask);
        this._alphaTestQueue.render(camera, pass.mask);
        if (camera.clearFlags & CameraClearFlags.Color) {
          if (background.mode === BackgroundMode.Sky) {
            background.sky._render(context);
          } else if (background.mode === BackgroundMode.Texture && background.texture) {
            this._drawBackgroundTexture(engine, background);
          }
        }
        this._transparentQueue.render(camera, pass.mask);
      }

      renderTarget?._blitRenderTarget();
      renderTarget?.generateMipmaps();
    }

    pass.postRender(camera, this._opaqueQueue, this._alphaTestQueue, this._transparentQueue);
  }

  /**
   * Push render data to render queue.
   * @param context - Render context
   * @param data - Render data
   */
  pushRenderData(context: RenderContext, data: RenderData): void {
    const { material } = data;
    const { renderStates } = material;
    const materialSubShader = material.shader.subShaders[0];
    const replacementShader = context.replacementShader;

    if (replacementShader) {
      const replacementSubShaders = replacementShader.subShaders;
      const { replacementTag: replacementTagKey } = context;
      if (replacementTagKey) {
        for (let i = 0, n = replacementSubShaders.length; i < n; i++) {
          const subShader = replacementSubShaders[i];
          if (subShader.getTagValue(replacementTagKey) === materialSubShader.getTagValue(replacementTagKey)) {
            this.pushRenderDataWihShader(context, data, subShader.passes, renderStates);
            break;
          }
        }
      } else {
        this.pushRenderDataWihShader(context, data, replacementSubShaders[0].passes, renderStates);
      }
    } else {
      this.pushRenderDataWihShader(context, data, materialSubShader.passes, renderStates);
    }
  }

  private pushRenderDataWihShader(
    context: RenderContext,
    element: RenderData,
    shaderPasses: ReadonlyArray<ShaderPass>,
    renderStates: ReadonlyArray<RenderState>
  ) {
    const pipelineStage = context.pipelineStageTagValue;
    const renderElementPool = context.camera.engine._renderElementPool;
    for (let i = 0, n = shaderPasses.length; i < n; i++) {
      const shaderPass = shaderPasses[i];
      if (shaderPass.getTagValue(RenderContext.pipelineStageKey) === pipelineStage) {
        const renderElement = renderElementPool.getFromPool();

        renderElement.set(element, shaderPass, renderStates[i]);
        switch (renderElement.renderState.renderQueueType) {
          case RenderQueueType.Transparent:
            this._transparentQueue.pushRenderElement(renderElement);
            break;
          case RenderQueueType.AlphaTest:
            this._alphaTestQueue.pushRenderElement(renderElement);
            break;
          case RenderQueueType.Opaque:
            this._opaqueQueue.pushRenderElement(renderElement);
            break;
        }
      }
    }
  }

  private _drawBackgroundTexture(engine: Engine, background: Background) {
    const rhi = engine._hardwareRenderer;
    const { _backgroundTextureMaterial, canvas } = engine;
    const mesh = background._mesh;

    if (
      (this._lastCanvasSize.x !== canvas.width || this._lastCanvasSize.y !== canvas.height) &&
      background._textureFillMode !== BackgroundTextureFillMode.Fill
    ) {
      this._lastCanvasSize.set(canvas.width, canvas.height);
      background._resizeBackgroundTexture();
    }

    const program = _backgroundTextureMaterial.shader.subShaders[0].passes[0]._getShaderProgram(
      engine,
      Shader._compileMacros
    );
    program.bind();
    program.uploadAll(program.materialUniformBlock, _backgroundTextureMaterial.shaderData);
    program.uploadUnGroupTextures();

    _backgroundTextureMaterial.renderState._apply(engine, false);
    rhi.drawPrimitive(mesh, mesh.subMesh, program);
  }

  private _callRender(context: RenderContext): void {
    const engine = context.camera.engine;
    const renderers = engine._componentsManager._renderers;
    const camera = context.camera;
    const elements = renderers._elements;
    for (let i = renderers.length - 1; i >= 0; --i) {
      const renderer = elements[i];

      // filter by camera culling mask.
      if (!(camera.cullingMask & renderer._entity.layer)) {
        continue;
      }

      // filter by camera frustum.
      if (camera.enableFrustumCulling) {
        if (!camera._frustum.intersectsBox(renderer.bounds)) {
          continue;
        }
      }
      renderer._renderFrameCount = engine.time.frameCount;
      renderer._prepareRender(context);
    }
  }
}
