import { MathUtil, Matrix, Vector3 } from "@oasis-engine/math";
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
import { TextureFilterMode } from "../texture/enums/TextureFilterMode";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { TextureWrapMode } from "../texture/enums/TextureWrapMode";
import { RenderTarget } from "../texture/RenderTarget";
import { Texture2D } from "../texture/Texture2D";
import { ShadowCascadesMode } from "./enum/ShadowCascadesMode";
import { ShadowMode } from "./enum/ShadowMode";
import { ShadowSliceData } from "./ShadowSliceData";
import { ShadowUtils } from "./ShadowUtils";

/**
 * Cascade shadow caster.
 */
export class CascadedShadowCaster {
  private static _lightViewProjMatProperty = Shader.getPropertyByName("u_lightViewProjMat");
  private static _lightShadowBiasProperty = Shader.getPropertyByName("u_shadowBias");
  private static _lightDirectionProperty = Shader.getPropertyByName("u_lightDirection");

  private static _viewProjMatFromLightProperty = Shader.getPropertyByName("u_viewProjMatFromLight");
  private static _shadowInfosProperty = Shader.getPropertyByName("u_shadowInfos");
  private static _shadowMapsProperty = Shader.getPropertyByName("u_shadowMaps");
  private static _shadowSplitSpheresProperty = Shader.getPropertyByName("u_shadowSplitSpheres");

  private static _maxCascades: number = 4;
  private static _cascadesSplitDistance: number[] = new Array(CascadedShadowCaster._maxCascades + 1);

  private static _tempVector = new Vector3();
  private static _tempMatrix0 = new Matrix();

  /** Max shadowMap count */
  static MAX_SHADOW = 2;

  private readonly _camera: Camera;
  private readonly _engine: Engine;
  private readonly _shadowMapMaterial: Material;

  private _shadowMode: ShadowMode;
  private _shadowMapResolution: number;
  private _shadowMapSize: Vector2 = new Vector2();
  private _shadowTileResoulution: number;
  private _shadowBias: Vector2 = new Vector2();
  private _shadowMapFormat: TextureFormat;
  private _shadowCascadeMode: ShadowCascadesMode;
  private _cascadeSplitRatio = new Float32Array(CascadedShadowCaster._maxCascades);
  private _shadowSliceData: ShadowSliceData = new ShadowSliceData();
  private _lightUp: Vector3 = new Vector3();
  private _lightSide: Vector3 = new Vector3();
  private _lightForward: Vector3 = new Vector3();
  private _shadowMapCount = 0;

  private _splitBoundSpheres = new Float32Array(4 * CascadedShadowCaster._maxCascades);
  // 4 viewProj matrix for cascade shadow
  private _vpMatrix = new Float32Array(64 * CascadedShadowCaster.MAX_SHADOW);
  // strength, resolution
  private _shadowInfos = new Float32Array(2 * CascadedShadowCaster.MAX_SHADOW);
  private _depthMap: Texture2D[] = [];
  private _renderTargets: RenderTarget[] = new Array(CascadedShadowCaster.MAX_SHADOW);
  private _viewportOffsets: Vector2[] = [new Vector2(), new Vector2(), new Vector2(), new Vector2()];

  constructor(camera: Camera) {
    this._camera = camera;
    this._engine = camera.engine;

    this._shadowMapMaterial = new Material(this._engine, Shader.find("shadow-map"));
  }

  /**
   * @internal
   */
  _render(): void {
    this._updateShadowSettings();
    this._depthMap.length = 0;
    this._shadowMapCount = 0;
    this._renderDirectShadowMap();

    const shadowMapCount = this._shadowMapCount;
    if (shadowMapCount) {
      this._updateReceiversShaderData();
      this._camera.scene.shaderData.enableMacro("CASCADED_SHADOW_MAP_COUNT", shadowMapCount.toString());
    } else {
      this._camera.scene.shaderData.disableMacro("CASCADED_SHADOW_MAP_COUNT");
    }
  }

  private _renderDirectShadowMap(): void {
    const {
      _engine: engine,
      _camera: camera,
      _shadowMapMaterial: shadowMapMaterial,
      _shadowMapCount: shadowMapCount,
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

    const lights = engine._lightManager._directLights;
    const componentsManager = engine._componentsManager;
    const rhi = engine._hardwareRenderer;
    const shadowCascades = engine.settings.shadowCascades;
    const splitDistance = CascadedShadowCaster._cascadesSplitDistance;
    const boundSphere = shadowSliceData.splitBoundSphere;
    const lightWorld = CascadedShadowCaster._tempMatrix0;
    const lightWorldE = lightWorld.elements;
    const lightUp = this._lightUp;
    const lightSide = this._lightSide;
    const lightForward = this._lightForward;

    this._updateCascadeSplitLambda();
    if (lights.length > 0) {
      for (let i = 0, len = lights.length; i < len; i++) {
        const light = lights.get(i);
        if (light.enableShadow && shadowMapCount < CascadedShadowCaster.MAX_SHADOW) {
          // prepare render target
          const renderTarget = this._getAvailableRenderTarget(shadowCascades);
          rhi.activeRenderTarget(renderTarget, null, 0);
          rhi.clearRenderTarget(engine, CameraClearFlags.Depth, null);
          this._shadowInfos[shadowMapCount * 2] = light.shadowStrength;
          this._shadowInfos[shadowMapCount * 2 + 1] = this._shadowTileResoulution;
          this._depthMap.push(<Texture2D>this._renderTargets[shadowMapCount].depthTexture);

          // prepare light and camera direction
          Matrix.rotationQuaternion(light.entity.transform.worldRotationQuaternion, lightWorld);
          lightSide.set(lightWorldE[0], lightWorldE[1], lightWorldE[2]);
          lightUp.set(lightWorldE[4], lightWorldE[5], lightWorldE[6]);
          lightForward.set(-lightWorldE[8], -lightWorldE[9], -lightWorldE[10]);
          camera.entity.transform.getWorldForward(CascadedShadowCaster._tempVector);

          for (let j = 0; j < shadowCascades; j++) {
            ShadowUtils.getBoundSphereByFrustum(
              splitDistance[j],
              splitDistance[j + 1],
              camera,
              CascadedShadowCaster._tempVector.normalize(),
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
              this._shadowTileResoulution,
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
            vpMatrix.set(shadowSliceData.viewProjectMatrix.elements, shadowMapCount * 64 + 16 * j);

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
            rhi.viewport(viewport.x, viewport.y, this._shadowTileResoulution, this._shadowTileResoulution);
            engine._renderCount++;

            opaqueQueue.render(camera, shadowMapMaterial, Layer.Everything);
            alphaTestQueue.render(camera, shadowMapMaterial, Layer.Everything);
          }
          this._shadowMapCount++;
        }
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
    shaderData.setFloatArray(CascadedShadowCaster._viewProjMatFromLightProperty, this._vpMatrix);
    shaderData.setFloatArray(CascadedShadowCaster._shadowInfosProperty, this._shadowInfos);
    shaderData.setTextureArray(CascadedShadowCaster._shadowMapsProperty, this._depthMap);
    shaderData.setFloatArray(CascadedShadowCaster._shadowSplitSpheresProperty, this._splitBoundSpheres);
  }

  private _updateCascadeSplitLambda(): void {
    const camera = this._camera;
    const { shadowCascades, shadowCascadeSplitRatio } = this._engine.settings;

    const nearClip = camera.nearClipPlane;
    const farClip = camera.farClipPlane;
    const clipRange = farClip - nearClip;

    const minZ = nearClip;
    const maxZ = nearClip + clipRange;

    const range = maxZ - minZ;
    const ratio = maxZ / minZ;
    // Calculate split depths based on view camera frustum
    // Based on method presented in https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch10.html
    for (let i = 0; i < shadowCascades; i++) {
      const p = (i + 1) / shadowCascades;
      const log = minZ * Math.pow(ratio, p);
      const uniform = minZ + range * p;
      const d = shadowCascadeSplitRatio * (log - uniform) + uniform;
      this._cascadeSplitRatio[i] = (d - nearClip) / clipRange;
    }
    this._getCascadesSplitDistance(shadowCascades);
  }

  private _getCascadesSplitDistance(shadowCascades: number): void {
    const { _cascadeSplitRatio: cascadeSplitRatio, _camera: camera } = this;
    const { nearClipPlane, farClipPlane, aspectRatio, fieldOfView } = camera;

    CascadedShadowCaster._cascadesSplitDistance[0] = nearClipPlane;
    const range = farClipPlane - nearClipPlane;
    const tFov = Math.tan(MathUtil.degreeToRadian(fieldOfView) * 0.5);
    const denominator = 1.0 + tFov * tFov * (aspectRatio * aspectRatio + 1.0);
    switch (shadowCascades) {
      case ShadowCascadesMode.NoCascades:
        CascadedShadowCaster._cascadesSplitDistance[1] = this._getFarWithRadius(farClipPlane, denominator);
        break;

      case ShadowCascadesMode.TwoCascades:
        CascadedShadowCaster._cascadesSplitDistance[1] = this._getFarWithRadius(
          nearClipPlane + range * cascadeSplitRatio[0],
          denominator
        );
        CascadedShadowCaster._cascadesSplitDistance[2] = this._getFarWithRadius(farClipPlane, denominator);
        break;

      case ShadowCascadesMode.FourCascades:
        CascadedShadowCaster._cascadesSplitDistance[1] = this._getFarWithRadius(
          nearClipPlane + range * cascadeSplitRatio[0],
          denominator
        );
        CascadedShadowCaster._cascadesSplitDistance[2] = this._getFarWithRadius(
          nearClipPlane + range * cascadeSplitRatio[1],
          denominator
        );
        CascadedShadowCaster._cascadesSplitDistance[3] = this._getFarWithRadius(
          nearClipPlane + range * cascadeSplitRatio[2],
          denominator
        );
        CascadedShadowCaster._cascadesSplitDistance[4] = this._getFarWithRadius(farClipPlane, denominator);
        break;
    }
  }

  private _getFarWithRadius(radius: number, denominator: number): number {
    // use the frustum side as the radius and get the far distance form camera.
    // var tFov: number = Math.tan(fov * 0.5);// get this the equation using Pythagorean
    // return Math.sqrt(radius * radius / (1.0 + tFov * tFov * (aspectRatio * aspectRatio + 1.0)));
    return Math.sqrt((radius * radius) / denominator);
  }

  private _getAvailableRenderTarget(cascadeMode: ShadowCascadesMode): RenderTarget {
    const engine = this._engine;
    const format = this._shadowMapFormat;
    const { x: width, y: height } = this._shadowMapSize;

    let renderTarget = this._renderTargets[this._shadowMapCount];
    if (
      renderTarget == null ||
      renderTarget?.depthTexture.width !== width ||
      renderTarget?.depthTexture.height !== height ||
      renderTarget?.depthTexture.format !== format
    ) {
      const depthTexture = new Texture2D(engine, width, height, format, false);
      depthTexture.wrapModeV = depthTexture.wrapModeU = TextureWrapMode.Clamp;
      depthTexture.filterMode = TextureFilterMode.Bilinear;
      if (engine._hardwareRenderer._isWebGL2) {
        depthTexture.depthCompareFunction = TextureDepthCompareFunction.Less;
      }

      renderTarget = this._renderTargets[this._shadowMapCount] = new RenderTarget(
        engine,
        width,
        height,
        null,
        depthTexture
      );
    }
    return renderTarget;
  }

  private _updateShadowSettings(): void {
    const renderTargets = this._renderTargets;
    const sceneShaderData = this._camera.scene.shaderData;
    const settings = this._engine.settings;
    const shadowFormat = ShadowUtils.shadowDepthFormat(settings.shadowResolution);
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
        this._shadowTileResoulution = shadowResolution;
        this._shadowMapSize.set(shadowResolution, shadowResolution);
      } else {
        const shadowTileResolution = ShadowUtils.getMaxTileResolutionInAtlas(
          shadowResolution,
          shadowResolution,
          shadowCascades
        );
        this._shadowTileResoulution = shadowTileResolution;
        this._shadowMapSize.set(
          shadowTileResolution * 2,
          shadowCascades == ShadowCascadesMode.TwoCascades ? shadowTileResolution : shadowTileResolution * 2
        );
      }

      renderTargets.fill(null);

      const viewportOffset = this._viewportOffsets;
      const shadowTileResoulution = this._shadowTileResoulution;
      switch (shadowCascades) {
        case ShadowCascadesMode.NoCascades:
          viewportOffset[0].set(0, 0);
          break;
        case ShadowCascadesMode.TwoCascades:
          viewportOffset[0].set(0, 0);
          viewportOffset[1].set(shadowTileResoulution, 0);
          break;
        case ShadowCascadesMode.FourCascades:
          viewportOffset[0].set(0, 0);
          viewportOffset[1].set(shadowTileResoulution, 0);
          viewportOffset[2].set(0, shadowTileResoulution);
          viewportOffset[3].set(shadowTileResoulution, shadowTileResoulution);
      }
    }
  }

  private _updateSingleShadowCasterShaderData(light: DirectLight, shadowSliceData: ShadowSliceData): void {
    // Frustum size is guaranteed to be a cube as we wrap shadow frustum around a sphere
    // elements[0] = 2.0 / (right - left)
    const frustumSize = 2.0 / shadowSliceData.projectionMatrix.elements[0];
    // depth and normal bias scale is in shadowMap texel size in world space
    const texelSize = frustumSize / this._shadowTileResoulution;
    this._shadowBias.set(-light.shadowBias * texelSize, -light.shadowNormalBias * texelSize);

    const sceneShaderData = this._camera.scene.shaderData;
    sceneShaderData.setVector2(CascadedShadowCaster._lightShadowBiasProperty, this._shadowBias);
    sceneShaderData.setVector3(CascadedShadowCaster._lightDirectionProperty, light.direction);
    sceneShaderData.setMatrix(CascadedShadowCaster._lightViewProjMatProperty, shadowSliceData.viewProjectMatrix);
  }
}
