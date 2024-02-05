import { Vector2 } from "@galacean/engine-math";
import { SpriteMask } from "../2d";
import { Background } from "../Background";
import { Camera } from "../Camera";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { BackgroundMode } from "../enums/BackgroundMode";
import { BackgroundTextureFillMode } from "../enums/BackgroundTextureFillMode";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { DepthTextureMode } from "../enums/DepthTextureMode";
import { Material } from "../material";
import { Shader } from "../shader/Shader";
import { ShaderPass } from "../shader/ShaderPass";
import { RenderQueueType } from "../shader/enums/RenderQueueType";
import { RenderState } from "../shader/state/RenderState";
import { CascadedShadowCasterPass } from "../shadow/CascadedShadowCasterPass";
import { ShadowType } from "../shadow/enum/ShadowType";
import { RenderTarget, TextureCubeFace } from "../texture";
import { CullingResults } from "./CullingResults";
import { DepthOnlyPass } from "./DepthOnlyPass";
import { RenderContext } from "./RenderContext";
import { RenderData } from "./RenderData";
import { RenderPass } from "./RenderPass";
import { PipelineStage } from "./enums/PipelineStage";

/**
 * Basic render pipeline.
 */
export class BasicRenderPipeline {
  /** @internal */
  _cullingResults: CullingResults;

  /** @internal */
  _allSpriteMasks: DisorderedArray<SpriteMask> = new DisorderedArray();

  private _camera: Camera;
  private _defaultPass: RenderPass;
  private _renderPassArray: Array<RenderPass>;
  private _lastCanvasSize = new Vector2();
  private _cascadedShadowCaster: CascadedShadowCasterPass;
  private _depthOnlyPass: DepthOnlyPass;

  /**
   * Create a basic render pipeline.
   * @param camera - Camera
   */
  constructor(camera: Camera) {
    this._camera = camera;
    const { engine } = camera;
    this._cullingResults = new CullingResults(engine);
    this._cascadedShadowCaster = new CascadedShadowCasterPass(camera);
    this._depthOnlyPass = new DepthOnlyPass(engine);

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
    this._cullingResults.destroy();
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
   * @param ignoreClear - Ignore clear flag
   */
  render(context: RenderContext, cubeFace?: TextureCubeFace, mipLevel?: number, ignoreClear?: CameraClearFlags) {
    const camera = this._camera;
    const scene = camera.scene;
    const cullingResults = this._cullingResults;
    const sunlight = scene._lightManager._sunlight;
    const depthOnlyPass = this._depthOnlyPass;
    const depthPassON = camera.depthTextureMode === DepthTextureMode.PrePass && depthOnlyPass._supportDepthTexture;
    const rtt2DON = camera.renderTarget && cubeFace == undefined;
    camera.engine._spriteMaskManager.clear();

    if (scene.castShadows && sunlight && sunlight.shadowType !== ShadowType.None) {
      this._cascadedShadowCaster.onRender(context);
    }

    cullingResults.reset();
    this._allSpriteMasks.length = 0;

    context.applyVirtualCamera(camera._virtualCamera, depthPassON || rtt2DON);
    this._callRender(context);

    cullingResults.sort();

    if (depthPassON) {
      depthOnlyPass.onConfig(camera);
      depthOnlyPass.onRender(context, cullingResults);
      if (!rtt2DON) {
        context.applyVirtualCamera(camera._virtualCamera, rtt2DON);
        this._callRender(context);
      }
    } else {
      camera.shaderData.setTexture(Camera._cameraDepthTextureProperty, camera.engine._whiteTexture2D);
    }

    for (let i = 0, len = this._renderPassArray.length; i < len; i++) {
      this._drawRenderPass(context, this._renderPassArray[i], camera, cubeFace, mipLevel, ignoreClear);
    }
  }

  private _drawRenderPass(
    context: RenderContext,
    pass: RenderPass,
    camera: Camera,
    cubeFace?: TextureCubeFace,
    mipLevel?: number,
    ignoreClear?: CameraClearFlags
  ) {
    const cullingResults = this._cullingResults;
    const { opaqueQueue, alphaTestQueue, transparentQueue } = cullingResults;
    pass.preRender(camera, opaqueQueue, alphaTestQueue, transparentQueue);

    if (pass.enabled) {
      const { engine, scene } = camera;
      const { background } = scene;
      const rhi = engine._hardwareRenderer;
      const renderTarget = camera.renderTarget || pass.renderTarget;
      rhi.activeRenderTarget(renderTarget, camera.viewport, mipLevel);
      renderTarget?._setRenderTargetInfo(cubeFace, mipLevel);
      const clearFlags = (pass.clearFlags ?? camera.clearFlags) & ~(ignoreClear ?? CameraClearFlags.None);
      const color = pass.clearColor ?? background.solidColor;
      if (clearFlags !== CameraClearFlags.None) {
        rhi.clearRenderTarget(camera.engine, clearFlags, color);
      }

      if (pass.renderOverride) {
        pass.render(camera, opaqueQueue, alphaTestQueue, transparentQueue);
      } else {
        opaqueQueue.render(camera, pass.mask, PipelineStage.Forward);
        alphaTestQueue.render(camera, pass.mask, PipelineStage.Forward);
        if (clearFlags & CameraClearFlags.Color) {
          if (background.mode === BackgroundMode.Sky) {
            background.sky._render(context);
          } else if (background.mode === BackgroundMode.Texture && background.texture) {
            this._drawBackgroundTexture(engine, background);
          }
        }
        cullingResults.transparentQueue.render(camera, pass.mask, PipelineStage.Forward);
      }

      renderTarget?._blitRenderTarget();
      renderTarget?.generateMipmaps();
    }

    pass.postRender(camera, cullingResults.opaqueQueue, cullingResults.alphaTestQueue, cullingResults.transparentQueue);
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
      const { replacementTag } = context;
      if (replacementTag) {
        for (let i = 0, n = replacementSubShaders.length; i < n; i++) {
          const subShader = replacementSubShaders[i];
          if (subShader.getTagValue(replacementTag) === materialSubShader.getTagValue(replacementTag)) {
            this.pushRenderDataWithShader(context, data, subShader.passes, renderStates);
            break;
          }
        }
      } else {
        this.pushRenderDataWithShader(context, data, replacementSubShaders[0].passes, renderStates);
      }
    } else {
      this.pushRenderDataWithShader(context, data, materialSubShader.passes, renderStates);
    }
  }

  private pushRenderDataWithShader(
    context: RenderContext,
    element: RenderData,
    shaderPasses: ReadonlyArray<ShaderPass>,
    renderStates: ReadonlyArray<RenderState>
  ) {
    const { opaqueQueue, alphaTestQueue, transparentQueue } = this._cullingResults;
    const renderElementPool = context.camera.engine._renderElementPool;

    let renderQueueAddedFlags = RenderQueueAddedFlag.None;
    for (let i = 0, n = shaderPasses.length; i < n; i++) {
      const renderQueueType = (shaderPasses[i]._renderState ?? renderStates[i]).renderQueueType;
      if (renderQueueAddedFlags & (<RenderQueueAddedFlag>(1 << renderQueueType))) {
        continue;
      }

      const renderElement = renderElementPool.getFromPool();
      renderElement.set(element, shaderPasses);
      switch (renderQueueType) {
        case RenderQueueType.Opaque:
          opaqueQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.Opaque;
          break;
        case RenderQueueType.AlphaTest:
          alphaTestQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.AlphaTest;
          break;
        case RenderQueueType.Transparent:
          transparentQueue.pushRenderElement(renderElement);
          renderQueueAddedFlags |= RenderQueueAddedFlag.Transparent;
          break;
      }
    }
  }

  private _drawBackgroundTexture(engine: Engine, background: Background) {
    const rhi = engine._hardwareRenderer;
    const { canvas } = engine;
    const { _material: material, _mesh: mesh } = background;

    if (
      (this._lastCanvasSize.x !== canvas.width || this._lastCanvasSize.y !== canvas.height) &&
      background._textureFillMode !== BackgroundTextureFillMode.Fill
    ) {
      this._lastCanvasSize.set(canvas.width, canvas.height);
      background._resizeBackgroundTexture();
    }

    const pass = material.shader.subShaders[0].passes[0];
    const program = pass._getShaderProgram(engine, Shader._compileMacros);
    program.bind();
    program.uploadAll(program.materialUniformBlock, material.shaderData);
    program.uploadUnGroupTextures();

    (pass._renderState || material.renderState)._apply(engine, false, pass._renderStateDataMap, material.shaderData);
    rhi.drawPrimitive(mesh._primitive, mesh.subMesh, program);
  }

  private _callRender(context: RenderContext): void {
    const engine = context.camera.engine;
    const camera = context.camera;
    const renderers = camera.scene._componentsManager._renderers;

    const elements = renderers._elements;
    for (let i = renderers.length - 1; i >= 0; --i) {
      const renderer = elements[i];

      // Filter by camera culling mask
      if (!(camera.cullingMask & renderer._entity.layer)) {
        continue;
      }

      // Filter by camera frustum
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

enum RenderQueueAddedFlag {
  None = 0x0,
  Opaque = 0x1,
  AlphaTest = 0x2,
  Transparent = 0x4
}
