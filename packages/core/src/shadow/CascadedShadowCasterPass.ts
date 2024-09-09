import { Color, MathUtil, Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Camera } from "../Camera";
import { PipelinePass } from "../RenderPipeline/PipelinePass";
import { PipelineUtils } from "../RenderPipeline/PipelineUtils";
import { ContextRendererUpdateFlag, RenderContext } from "../RenderPipeline/RenderContext";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { PipelineStage } from "../RenderPipeline/index";
import { GLCapabilityType } from "../base/Constant";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { DirectLight } from "../lighting";
import { ShaderProperty } from "../shader";
import { TextureFilterMode } from "../texture";
import { RenderTarget } from "../texture/RenderTarget";
import { Texture2D } from "../texture/Texture2D";
import { TextureDepthCompareFunction } from "../texture/enums/TextureDepthCompareFunction";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";
import { ShadowSliceData } from "./ShadowSliceData";
import { ShadowUtils } from "./ShadowUtils";
import { ShadowCascadesMode } from "./enum/ShadowCascadesMode";

/**
 * Cascade shadow caster pass.
 */
export class CascadedShadowCasterPass extends PipelinePass {
  private static _lightShadowBiasProperty = ShaderProperty.getByName("scene_ShadowBias");
  private static _lightDirectionProperty = ShaderProperty.getByName("scene_LightDirection");

  private static _shadowMatricesProperty = ShaderProperty.getByName("scene_ShadowMatrices");
  private static _shadowMapSize = ShaderProperty.getByName("scene_ShadowMapSize");
  private static _shadowInfosProperty = ShaderProperty.getByName("scene_ShadowInfo");
  private static _shadowMapsProperty = ShaderProperty.getByName("scene_ShadowMap");
  private static _shadowSplitSpheresProperty = ShaderProperty.getByName("scene_ShadowSplitSpheres");

  private static _maxCascades: number = 4;
  private static _cascadesSplitDistance: number[] = new Array(CascadedShadowCasterPass._maxCascades + 1);

  private static _viewport = new Vector4(0, 0, 1, 1);
  private static _clearColor = new Color(1, 1, 1, 1);
  private static _tempVector = new Vector3();
  private static _tempMatrix0 = new Matrix();

  private readonly _camera: Camera;
  private readonly _supportDepthTexture: boolean;

  private _shadowMapResolution: number;
  private _shadowMapSize: Vector4 = new Vector4();
  private _shadowTileResolution: number;
  private _shadowBias: Vector2 = new Vector2();
  private _shadowMapFormat: TextureFormat;
  private _shadowCascadeMode: ShadowCascadesMode;
  private _shadowSliceData: ShadowSliceData = new ShadowSliceData();
  private _lightUp: Vector3 = new Vector3();
  private _lightSide: Vector3 = new Vector3();

  private _splitBoundSpheres = new Float32Array(CascadedShadowCasterPass._maxCascades * 4);
  /** The end is project precision problem in shader. */
  private _shadowMatrices = new Float32Array((CascadedShadowCasterPass._maxCascades + 1) * 16);
  // intensity, null, fadeScale, fadeBias
  private _shadowInfos = new Vector4();
  private _depthTexture: Texture2D;
  private _renderTarget: RenderTarget;
  private _viewportOffsets: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];

  constructor(camera: Camera) {
    super(camera.engine);
    this._camera = camera;

    this._supportDepthTexture = camera.engine._hardwareRenderer.canIUse(GLCapabilityType.depthTexture);
    this._shadowSliceData.virtualCamera.isOrthographic = true;
  }

  /**
   * @internal
   */
  override onRender(context: RenderContext): void {
    const light = this._camera.scene._lightManager._sunlight;
    this._updateShadowSettings();
    this._renderDirectShadowMap(context, light);
    this._updateReceiversShaderData(light);
  }

  private _renderDirectShadowMap(context: RenderContext, light: DirectLight): void {
    const {
      engine,
      _camera: camera,
      _viewportOffsets: viewports,
      _shadowSliceData: shadowSliceData,
      _splitBoundSpheres: splitBoundSpheres,
      _shadowMatrices: shadowMatrices
    } = this;

    const { opaqueQueue, alphaTestQueue } = camera._renderPipeline._cullingResults;

    const scene = camera.scene;
    const componentsManager = scene._componentsManager;
    const rhi = engine._hardwareRenderer;
    const shadowCascades = scene.shadowCascades;
    const splitDistance = CascadedShadowCasterPass._cascadesSplitDistance;
    const boundSphere = shadowSliceData.splitBoundSphere;
    const lightWorld = CascadedShadowCasterPass._tempMatrix0;
    const lightWorldE = lightWorld.elements;
    const lightUp = this._lightUp;
    const lightSide = this._lightSide;
    const lightForward = shadowSliceData.virtualCamera.forward;

    // Prepare render target
    const { z: width, w: height } = this._shadowMapSize;
    const format = this._shadowMapFormat;
    let renderTarget: RenderTarget;
    let shadowTexture: Texture2D;
    if (this._supportDepthTexture) {
      renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._renderTarget,
        width,
        height,
        null,
        format,
        true,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
      shadowTexture = <Texture2D>renderTarget.depthTexture;
    } else {
      renderTarget = PipelineUtils.recreateRenderTargetIfNeeded(
        engine,
        this._renderTarget,
        width,
        height,
        format,
        null,
        false,
        false,
        1,
        TextureWrapMode.Clamp,
        TextureFilterMode.Bilinear
      );
      shadowTexture = <Texture2D>renderTarget.getColorTexture(0);
    }

    if (engine._hardwareRenderer._isWebGL2) {
      shadowTexture.depthCompareFunction = TextureDepthCompareFunction.Less;
    }

    this._renderTarget = renderTarget;
    this._depthTexture = shadowTexture;

    // @todo: shouldn't set viewport and scissor in activeRenderTarget
    rhi.activeRenderTarget(renderTarget, CascadedShadowCasterPass._viewport, context.flipProjection, 0);
    if (this._supportDepthTexture) {
      rhi.clearRenderTarget(engine, CameraClearFlags.DepthStencil, null);
    } else {
      rhi.clearRenderTarget(engine, CameraClearFlags.All, CascadedShadowCasterPass._clearColor);
    }
    scene._maskManager.preMaskLayer = 0;

    // prepare light and camera direction
    Matrix.rotationQuaternion(light.entity.transform.worldRotationQuaternion, lightWorld);
    lightSide.set(lightWorldE[0], lightWorldE[1], lightWorldE[2]);
    lightUp.set(lightWorldE[4], lightWorldE[5], lightWorldE[6]);
    lightForward.set(-lightWorldE[8], -lightWorldE[9], -lightWorldE[10]);
    const cameraForward = CascadedShadowCasterPass._tempVector;
    cameraForward.copyFrom(camera.entity.transform.worldForward);

    const shadowTileResolution = this._shadowTileResolution;

    for (let j = 0; j < shadowCascades; j++) {
      ShadowUtils.getBoundSphereByFrustum(
        splitDistance[j],
        splitDistance[j + 1],
        camera,
        cameraForward,
        shadowSliceData
      );
      ShadowUtils.getDirectionLightShadowCullPlanes(
        camera._frustum,
        splitDistance[j],
        camera.nearClipPlane,
        lightForward,
        shadowSliceData
      );

      ShadowUtils.getDirectionalLightMatrices(
        lightUp,
        lightSide,
        lightForward,
        j,
        light.shadowNearPlane,
        shadowTileResolution,
        shadowSliceData,
        shadowMatrices
      );
      if (shadowCascades > 1) {
        ShadowUtils.applySliceTransform(
          shadowTileResolution,
          width,
          height,
          j,
          this._viewportOffsets[j],
          shadowMatrices
        );
      }
      this._updateSingleShadowCasterShaderData(light, shadowSliceData, context);

      // upload pre-cascade infos.
      const center = boundSphere.center;
      const radius = boundSphere.radius;
      const offset = j * 4;
      splitBoundSpheres[offset] = center.x;
      splitBoundSpheres[offset + 1] = center.y;
      splitBoundSpheres[offset + 2] = center.z;
      splitBoundSpheres[offset + 3] = radius * radius;
      opaqueQueue.clear();
      alphaTestQueue.clear();
      const renderers = componentsManager._renderers;
      const elements = renderers._elements;
      for (let k = renderers.length - 1; k >= 0; --k) {
        ShadowUtils.shadowCullFrustum(context, light, elements[k], shadowSliceData);
      }

      if (opaqueQueue.elements.length || alphaTestQueue.elements.length) {
        // @todo: It is more appropriate to prevent duplication based on `virtualCamera` at `RenderQueue#render`.
        engine._renderCount++;

        const batcherManager = engine._batcherManager;
        opaqueQueue.sortBatch(RenderQueue.compareForOpaque, batcherManager);
        alphaTestQueue.sortBatch(RenderQueue.compareForOpaque, batcherManager);

        const { x, y } = viewports[j];

        rhi.setGlobalDepthBias(1.0, 1.0);

        rhi.viewport(x, y, shadowTileResolution, shadowTileResolution);
        // for no cascade is for the edge,for cascade is for the beyond maxCascade pixel can use (0,0,0) trick sample the shadowMap
        rhi.scissor(x + 1, y + 1, shadowTileResolution - 2, shadowTileResolution - 2);

        opaqueQueue.render(context, PipelineStage.ShadowCaster);
        alphaTestQueue.render(context, PipelineStage.ShadowCaster);
        rhi.setGlobalDepthBias(0, 0);
      }
    }
  }

  private _updateReceiversShaderData(light: DirectLight): void {
    const camera = this._camera;
    const scene = camera.scene;
    const splitBoundSpheres = this._splitBoundSpheres;
    const shadowMatrices = this._shadowMatrices;
    const shadowCascades = scene.shadowCascades;

    const shadowFar = Math.min(scene.shadowDistance, camera.farClipPlane);
    ShadowUtils.getScaleAndBiasForLinearDistanceFade(Math.pow(shadowFar, 2), scene.shadowFadeBorder, this._shadowInfos);
    this._shadowInfos.x = light.shadowStrength;

    // set zero matrix to project the index out of max cascade
    if (shadowCascades > 1) {
      for (let i = shadowCascades * 4, n = splitBoundSpheres.length; i < n; i++) {
        splitBoundSpheres[i] = 0.0;
      }
    }

    // set zero matrix to project the index out of max cascade
    for (var i = shadowCascades * 16, n = shadowMatrices.length; i < n; i++) {
      shadowMatrices[i] = 0.0;
    }

    const shaderData = scene.shaderData;
    shaderData.setFloatArray(CascadedShadowCasterPass._shadowMatricesProperty, this._shadowMatrices);
    shaderData.setVector4(CascadedShadowCasterPass._shadowInfosProperty, this._shadowInfos);
    shaderData.setTexture(CascadedShadowCasterPass._shadowMapsProperty, this._depthTexture);
    shaderData.setFloatArray(CascadedShadowCasterPass._shadowSplitSpheresProperty, this._splitBoundSpheres);
    shaderData.setVector4(CascadedShadowCasterPass._shadowMapSize, this._shadowMapSize);
  }

  private _getCascadesSplitDistance(shadowFar: number): void {
    const cascadesSplitDistance = CascadedShadowCasterPass._cascadesSplitDistance;
    const { shadowTwoCascadeSplits, shadowFourCascadeSplits, shadowCascades } = this._camera.scene;
    const { nearClipPlane, aspectRatio, fieldOfView } = this._camera;

    cascadesSplitDistance[0] = nearClipPlane;
    const range = shadowFar - nearClipPlane;
    const tFov = Math.tan(MathUtil.degreeToRadian(fieldOfView) * 0.5);
    const denominator = 1.0 + tFov * tFov * (aspectRatio * aspectRatio + 1.0);
    switch (shadowCascades) {
      case ShadowCascadesMode.NoCascades:
        cascadesSplitDistance[1] = this._getFarWithRadius(shadowFar, denominator);
        break;
      case ShadowCascadesMode.TwoCascades:
        cascadesSplitDistance[1] = this._getFarWithRadius(nearClipPlane + range * shadowTwoCascadeSplits, denominator);
        cascadesSplitDistance[2] = this._getFarWithRadius(shadowFar, denominator);
        break;
      case ShadowCascadesMode.FourCascades:
        cascadesSplitDistance[1] = this._getFarWithRadius(
          nearClipPlane + range * shadowFourCascadeSplits.x,
          denominator
        );
        cascadesSplitDistance[2] = this._getFarWithRadius(
          nearClipPlane + range * shadowFourCascadeSplits.y,
          denominator
        );
        cascadesSplitDistance[3] = this._getFarWithRadius(
          nearClipPlane + range * shadowFourCascadeSplits.z,
          denominator
        );
        cascadesSplitDistance[4] = this._getFarWithRadius(shadowFar, denominator);
        break;
    }
  }

  private _getFarWithRadius(radius: number, denominator: number): number {
    // use the frustum side as the radius and get the far distance form camera.
    // var tFov: number = Math.tan(fov * 0.5);// get this the equation using Pythagorean
    // return Math.sqrt(radius * radius / (1.0 + tFov * tFov * (aspectRatio * aspectRatio + 1.0)));
    return Math.sqrt((radius * radius) / denominator);
  }

  private _updateShadowSettings(): void {
    const camera = this._camera;
    const scene = camera.scene;
    const shadowFormat = ShadowUtils.shadowDepthFormat(scene.shadowResolution, this._supportDepthTexture);
    const shadowResolution = ShadowUtils.shadowResolution(scene.shadowResolution);
    const shadowCascades = scene.shadowCascades;
    const shadowFar = Math.min(scene.shadowDistance, camera.farClipPlane);

    this._getCascadesSplitDistance(shadowFar);

    if (
      shadowFormat !== this._shadowMapFormat ||
      shadowResolution !== this._shadowMapResolution ||
      shadowCascades !== this._shadowCascadeMode
    ) {
      this._shadowMapFormat = shadowFormat;
      this._shadowMapResolution = shadowResolution;
      this._shadowCascadeMode = shadowCascades;

      if (shadowCascades == ShadowCascadesMode.NoCascades) {
        this._shadowTileResolution = shadowResolution;
        this._shadowMapSize.set(1 / shadowResolution, 1 / shadowResolution, shadowResolution, shadowResolution);
      } else {
        const shadowTileResolution = ShadowUtils.getMaxTileResolutionInAtlas(
          shadowResolution,
          shadowResolution,
          shadowCascades
        );
        this._shadowTileResolution = shadowTileResolution;
        const width = shadowTileResolution * 2;
        const height =
          shadowCascades == ShadowCascadesMode.TwoCascades ? shadowTileResolution : shadowTileResolution * 2;
        this._shadowMapSize.set(1.0 / width, 1.0 / height, width, height);
      }

      this._renderTarget = null;

      const viewportOffset = this._viewportOffsets;
      const shadowTileResolution = this._shadowTileResolution;
      switch (shadowCascades) {
        case ShadowCascadesMode.NoCascades:
          viewportOffset[0].set(0, 0);
          break;
        case ShadowCascadesMode.TwoCascades:
          viewportOffset[0].set(0, 0);
          viewportOffset[1].set(shadowTileResolution, 0);
          break;
        case ShadowCascadesMode.FourCascades:
          viewportOffset[0].set(0, 0);
          viewportOffset[1].set(shadowTileResolution, 0);
          viewportOffset[2].set(0, shadowTileResolution);
          viewportOffset[3].set(shadowTileResolution, shadowTileResolution);
      }
    }
  }

  private _updateSingleShadowCasterShaderData(
    light: DirectLight,
    shadowSliceData: ShadowSliceData,
    context: RenderContext
  ): void {
    const virtualCamera = shadowSliceData.virtualCamera;
    ShadowUtils.getShadowBias(light, virtualCamera.projectionMatrix, this._shadowTileResolution, this._shadowBias);

    const sceneShaderData = this._camera.scene.shaderData;
    sceneShaderData.setVector2(CascadedShadowCasterPass._lightShadowBiasProperty, this._shadowBias);
    sceneShaderData.setVector3(CascadedShadowCasterPass._lightDirectionProperty, light.direction);

    // Every light use self virtual camera
    context.rendererUpdateFlag |= ContextRendererUpdateFlag.viewProjectionMatrix;
    context.applyVirtualCamera(virtualCamera, true);
  }
}
