import { Color, MathUtil, Matrix, Vector3 } from "@oasis-engine/math";
import { Vector2 } from "@oasis-engine/math/src";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { Layer } from "../Layer";
import { DirectLight } from "../lighting";
import { Material } from "../material";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { Shader } from "../shader";
import { TextureDepthCompareFunction } from "../texture/enums/TextureDepthCompareFunction";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";
import { RenderTarget } from "../texture/RenderTarget";
import { Texture2D } from "../texture/Texture2D";
import { ShadowCascadesMode } from "./enum/ShadowCascadesMode";
import { ShadowMode } from "./enum/ShadowMode";
import { ShadowSliceData } from "./ShadowSliceData";
import { ShadowUtils } from "./ShadowUtils";
import { GLCapabilityType } from "../base/Constant";

/**
 * Cascade shadow caster.
 */
export class CascadedShadowCasterPass {
  private static _lightViewProjMatProperty = Shader.getPropertyByName("u_lightViewProjMat");
  private static _lightShadowBiasProperty = Shader.getPropertyByName("u_shadowBias");
  private static _lightDirectionProperty = Shader.getPropertyByName("u_lightDirection");

  private static _viewProjMatFromLightProperty = Shader.getPropertyByName("u_viewProjMatFromLight");
  private static _shadowInfosProperty = Shader.getPropertyByName("u_shadowInfo");
  private static _shadowMapsProperty = Shader.getPropertyByName("u_shadowMap");
  private static _shadowSplitSpheresProperty = Shader.getPropertyByName("u_shadowSplitSpheres");

  private static _maxCascades: number = 4;
  private static _cascadesSplitDistance: number[] = new Array(CascadedShadowCasterPass._maxCascades + 1);

  private static _clearColor = new Color(1, 1, 1, 1);
  private static _tempVector = new Vector3();
  private static _tempMatrix0 = new Matrix();

  private readonly _camera: Camera;
  private readonly _engine: Engine;
  private readonly _shadowMapMaterial: Material;
  private readonly _supportDepthTexture: boolean;

  private _shadowMode: ShadowMode;
  private _shadowMapResolution: number;
  private _shadowMapSize: Vector2 = new Vector2();
  private _shadowTileResolution: number;
  private _shadowBias: Vector2 = new Vector2();
  private _shadowMapFormat: TextureFormat;
  private _shadowCascadeMode: ShadowCascadesMode;
  private _shadowSliceData: ShadowSliceData = new ShadowSliceData();
  private _lightUp: Vector3 = new Vector3();
  private _lightSide: Vector3 = new Vector3();
  private _lightForward: Vector3 = new Vector3();
  private _existShadowMap: boolean = false;

  private _splitBoundSpheres = new Float32Array(4 * CascadedShadowCasterPass._maxCascades);
  // 4 viewProj matrix for cascade shadow
  private _vpMatrix = new Float32Array(64);
  // strength, resolution, lightIndex
  private _shadowInfos = new Vector3();
  private _depthTexture: Texture2D;
  private _renderTargets: RenderTarget;
  private _viewportOffsets: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];

  constructor(camera: Camera) {
    this._camera = camera;
    this._engine = camera.engine;

    this._supportDepthTexture = camera.engine._hardwareRenderer.canIUse(GLCapabilityType.depthTexture);
    this._shadowMapMaterial = new Material(this._engine, Shader.find("shadow-map"));
  }

  /**
   * @internal
   */
  _render(): void {
    this._updateShadowSettings();
    this._existShadowMap = false;
    this._renderDirectShadowMap();

    if (this._existShadowMap) {
      this._updateReceiversShaderData();
      this._camera.scene.shaderData.enableMacro("CASCADED_SHADOW_MAP");
    } else {
      this._camera.scene.shaderData.disableMacro("CASCADED_SHADOW_MAP");
    }
  }

  private _renderDirectShadowMap(): void {
    const {
      _engine: engine,
      _camera: camera,
      _shadowMapMaterial: shadowMapMaterial,
      _viewportOffsets: viewports,
      _shadowSliceData: shadowSliceData,
      _splitBoundSpheres: splitBoundSpheres,
      _vpMatrix: vpMatrix
    } = this;

    const {
      _opaqueQueue: opaqueQueue,
      _alphaTestQueue: alphaTestQueue,
      _transparentQueue: transparentQueue
    } = camera._renderPipeline;

    const componentsManager = engine._componentsManager;
    const rhi = engine._hardwareRenderer;
    const shadowCascades = engine.settings.shadowCascades;
    const splitDistance = CascadedShadowCasterPass._cascadesSplitDistance;
    const boundSphere = shadowSliceData.splitBoundSphere;
    const lightWorld = CascadedShadowCasterPass._tempMatrix0;
    const lightWorldE = lightWorld.elements;
    const lightUp = this._lightUp;
    const lightSide = this._lightSide;
    const lightForward = this._lightForward;

    const lights = engine._lightManager._directLights;
    const sunLightIndex = engine._lightManager._getSunLightIndex();

    this._getCascadesSplitDistance();
    if (sunLightIndex !== -1) {
      const light = lights.get(sunLightIndex);
      if (light.enableShadow) {
        // prepare render target
        const renderTarget = this._getAvailableRenderTarget();
        rhi.activeRenderTarget(renderTarget, null, 0);
        if (this._supportDepthTexture) {
          rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);
        } else {
          rhi.clearRenderTarget(engine, CameraClearFlags.All, CascadedShadowCasterPass._clearColor);
        }
        this._shadowInfos.x = light.shadowStrength;
        this._shadowInfos.y = this._shadowTileResolution;
        this._shadowInfos.z = sunLightIndex;

        // prepare light and camera direction
        Matrix.rotationQuaternion(light.entity.transform.worldRotationQuaternion, lightWorld);
        lightSide.set(lightWorldE[0], lightWorldE[1], lightWorldE[2]);
        lightUp.set(lightWorldE[4], lightWorldE[5], lightWorldE[6]);
        lightForward.set(-lightWorldE[8], -lightWorldE[9], -lightWorldE[10]);
        camera.entity.transform.getWorldForward(CascadedShadowCasterPass._tempVector);

        for (let j = 0; j < shadowCascades; j++) {
          ShadowUtils.getBoundSphereByFrustum(
            splitDistance[j],
            splitDistance[j + 1],
            camera,
            CascadedShadowCasterPass._tempVector.normalize(),
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
            this._shadowTileResolution,
            shadowSliceData
          );
          this._updateSingleShadowCasterShaderData(<DirectLight>light, shadowSliceData);

          // upload pre-cascade infos.
          const center = boundSphere.center;
          const radius = boundSphere.radius;
          const offset = j * 4;
          splitBoundSpheres[offset] = center.x;
          splitBoundSpheres[offset + 1] = center.y;
          splitBoundSpheres[offset + 2] = center.z;
          splitBoundSpheres[offset + 3] = radius * radius;
          vpMatrix.set(shadowSliceData.viewProjectMatrix.elements, 16 * j);

          opaqueQueue.clear();
          alphaTestQueue.clear();
          transparentQueue.clear();
          const renderers = componentsManager._renderers;
          const elements = renderers._elements;
          for (let k = renderers.length - 1; k >= 0; --k) {
            ShadowUtils.shadowCullFrustum(camera, elements[k], shadowSliceData);
          }
          opaqueQueue.sort(RenderQueue._compareFromNearToFar);
          alphaTestQueue.sort(RenderQueue._compareFromNearToFar);

          const viewport = viewports[j];
          rhi.viewport(viewport.x, viewport.y, this._shadowTileResolution, this._shadowTileResolution);
          engine._renderCount++;

          opaqueQueue.render(camera, shadowMapMaterial, Layer.Everything);
          alphaTestQueue.render(camera, shadowMapMaterial, Layer.Everything);
        }
        this._existShadowMap = true;
      }
    }
  }

  private _updateReceiversShaderData(): void {
    const splitBoundSpheres = this._splitBoundSpheres;
    const shadowCascades = this._engine.settings.shadowCascades;
    for (let i = shadowCascades * 4, n = 4 * 4; i < n; i++) {
      splitBoundSpheres[i] = 0.0;
    }

    const shaderData = this._camera.scene.shaderData;
    shaderData.setFloatArray(CascadedShadowCasterPass._viewProjMatFromLightProperty, this._vpMatrix);
    shaderData.setVector3(CascadedShadowCasterPass._shadowInfosProperty, this._shadowInfos);
    shaderData.setTexture(CascadedShadowCasterPass._shadowMapsProperty, this._depthTexture);
    shaderData.setFloatArray(CascadedShadowCasterPass._shadowSplitSpheresProperty, this._splitBoundSpheres);
  }

  private _getCascadesSplitDistance(): void {
    const { shadowTwoCascadeSplits, shadowFourCascadeSplits, shadowCascades } = this._engine.settings;
    const camera = this._camera;
    const { nearClipPlane, farClipPlane, aspectRatio, fieldOfView } = camera;

    CascadedShadowCasterPass._cascadesSplitDistance[0] = nearClipPlane;
    const range = farClipPlane - nearClipPlane;
    const tFov = Math.tan(MathUtil.degreeToRadian(fieldOfView) * 0.5);
    const denominator = 1.0 + tFov * tFov * (aspectRatio * aspectRatio + 1.0);
    switch (shadowCascades) {
      case ShadowCascadesMode.NoCascades:
        CascadedShadowCasterPass._cascadesSplitDistance[1] = this._getFarWithRadius(farClipPlane, denominator);
        break;

      case ShadowCascadesMode.TwoCascades:
        CascadedShadowCasterPass._cascadesSplitDistance[1] = this._getFarWithRadius(
          nearClipPlane + range * shadowTwoCascadeSplits,
          denominator
        );
        CascadedShadowCasterPass._cascadesSplitDistance[2] = this._getFarWithRadius(farClipPlane, denominator);
        break;

      case ShadowCascadesMode.FourCascades:
        CascadedShadowCasterPass._cascadesSplitDistance[1] = this._getFarWithRadius(
          nearClipPlane + range * shadowFourCascadeSplits.x,
          denominator
        );
        CascadedShadowCasterPass._cascadesSplitDistance[2] = this._getFarWithRadius(
          nearClipPlane + range * shadowFourCascadeSplits.y,
          denominator
        );
        CascadedShadowCasterPass._cascadesSplitDistance[3] = this._getFarWithRadius(
          nearClipPlane + range * shadowFourCascadeSplits.z,
          denominator
        );
        CascadedShadowCasterPass._cascadesSplitDistance[4] = this._getFarWithRadius(farClipPlane, denominator);
        break;
    }
  }

  private _getFarWithRadius(radius: number, denominator: number): number {
    // use the frustum side as the radius and get the far distance form camera.
    // var tFov: number = Math.tan(fov * 0.5);// get this the equation using Pythagorean
    // return Math.sqrt(radius * radius / (1.0 + tFov * tFov * (aspectRatio * aspectRatio + 1.0)));
    return Math.sqrt((radius * radius) / denominator);
  }

  private _getAvailableRenderTarget(): RenderTarget {
    const engine = this._engine;
    const format = this._shadowMapFormat;
    const { x: width, y: height } = this._shadowMapSize;
    let depthTexture = this._depthTexture;
    let renderTarget = this._renderTargets;
    if (
      renderTarget == null ||
      depthTexture?.width !== width ||
      depthTexture?.height !== height ||
      depthTexture?.format !== format
    ) {
      depthTexture = this._depthTexture = new Texture2D(engine, width, height, format, false);
      depthTexture.wrapModeV = depthTexture.wrapModeU = TextureWrapMode.Clamp;
      if (engine._hardwareRenderer._isWebGL2) {
        depthTexture.depthCompareFunction = TextureDepthCompareFunction.Less;
      }

      if (this._supportDepthTexture) {
        renderTarget = this._renderTargets = new RenderTarget(engine, width, height, null, depthTexture);
      } else {
        renderTarget = this._renderTargets = new RenderTarget(engine, width, height, depthTexture);
      }
    }
    return renderTarget;
  }

  private _updateShadowSettings(): void {
    const sceneShaderData = this._camera.scene.shaderData;
    const settings = this._engine.settings;
    const shadowFormat = ShadowUtils.shadowDepthFormat(settings.shadowResolution, this._supportDepthTexture);
    const shadowResolution = ShadowUtils.shadowResolution(settings.shadowResolution);
    const shadowCascades = settings.shadowCascades;
    if (shadowCascades !== this._shadowCascadeMode) {
      sceneShaderData.enableMacro("CASCADED_COUNT", shadowCascades.toString());
    }
    const shadowMode = settings.shadowMode;
    if (shadowMode !== this._shadowMode) {
      sceneShaderData.enableMacro("SHADOW_MODE", shadowMode.toString());
      this._shadowMode = shadowMode;
    }

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
        this._shadowMapSize.set(shadowResolution, shadowResolution);
      } else {
        const shadowTileResolution = ShadowUtils.getMaxTileResolutionInAtlas(
          shadowResolution,
          shadowResolution,
          shadowCascades
        );
        this._shadowTileResolution = shadowTileResolution;
        this._shadowMapSize.set(
          shadowTileResolution * 2,
          shadowCascades == ShadowCascadesMode.TwoCascades ? shadowTileResolution : shadowTileResolution * 2
        );
      }

      this._renderTargets = null;

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

  private _updateSingleShadowCasterShaderData(light: DirectLight, shadowSliceData: ShadowSliceData): void {
    // Frustum size is guaranteed to be a cube as we wrap shadow frustum around a sphere
    // elements[0] = 2.0 / (right - left)
    const frustumSize = 2.0 / shadowSliceData.projectionMatrix.elements[0];
    // depth and normal bias scale is in shadowMap texel size in world space
    const texelSize = frustumSize / this._shadowTileResolution;
    this._shadowBias.set(-light.shadowBias * texelSize, -light.shadowNormalBias * texelSize);

    const sceneShaderData = this._camera.scene.shaderData;
    sceneShaderData.setVector2(CascadedShadowCasterPass._lightShadowBiasProperty, this._shadowBias);
    sceneShaderData.setVector3(CascadedShadowCasterPass._lightDirectionProperty, light.direction);
    sceneShaderData.setMatrix(CascadedShadowCasterPass._lightViewProjMatProperty, shadowSliceData.viewProjectMatrix);
  }
}
