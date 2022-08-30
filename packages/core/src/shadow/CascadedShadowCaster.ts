import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { ShadowMapMaterial } from "./ShadowMapMaterial";
import { BoundingFrustum, Matrix, Vector3, Vector4 } from "@oasis-engine/math";
import { Shader } from "../shader";
import { RenderTarget, Texture2D, TextureFormat, TextureWrapMode } from "../texture";
import { DirectLight } from "../lighting";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { ShadowUtils } from "./ShadowUtils";
import { ShadowCascadesMode } from "./enum/ShadowCascadesMode";

/**
 * Cascade shadow caster.
 */
export class CascadedShadowCaster {
  private static _lightViewProjMatProperty = Shader.getPropertyByName("u_lightViewProjMat");

  private static _viewProjMatFromLightProperty = Shader.getPropertyByName("u_viewProjMatFromLight");
  private static _shadowInfosProperty = Shader.getPropertyByName("u_shadowInfos");
  private static _shadowMapsProperty = Shader.getPropertyByName("u_shadowMaps");
  private static _shadowCascadeProperty = Shader.getPropertyByName("u_cascade");

  private static _tempProjMatrix = new Matrix();
  private static _tempViewMatrix = new Matrix();
  private static _tempVector = new Vector3();
  private static _tempWorldPos = new Vector3();

  private static _frustumCorners = [
    new Vector3(-1.0, 1.0, -1.0),
    new Vector3(1.0, 1.0, -1.0),
    new Vector3(1.0, -1.0, -1.0),
    new Vector3(-1.0, -1.0, -1.0),
    new Vector3(-1.0, 1.0, 1.0),
    new Vector3(1.0, 1.0, 1.0),
    new Vector3(1.0, -1.0, 1.0),
    new Vector3(-1.0, -1.0, 1.0)
  ];

  /** Max shadowMap count */
  static MAX_SHADOW = 2;

  private readonly _opaqueQueue: RenderQueue;
  private readonly _transparentQueue: RenderQueue;
  private readonly _alphaTestQueue: RenderQueue;
  private readonly _camera: Camera;
  private readonly _shadowMapMaterial: ShadowMapMaterial;

  private _shadowMapResolution: number;
  private _shadowMapFormat: TextureFormat;
  private _shadowCascadeMode: ShadowCascadesMode;
  private _cascadeSplitRatio = new Float32Array(4);
  private _cascadeSplits = new Vector4();
  private _shadowMapCount = 0;
  private _frustums = new BoundingFrustum();

  // 4 viewProj matrix for cascade shadow
  private _vpMatrix = new Float32Array(64 * CascadedShadowCaster.MAX_SHADOW);
  // bias, strength, radius, whether cascade
  private _shadowInfos = new Float32Array(4 * CascadedShadowCaster.MAX_SHADOW);
  private _depthMap: Texture2D[] = [];
  private _renderTargets = new Array<RenderTarget>(CascadedShadowCaster.MAX_SHADOW);
  private _viewport: Vector4[] = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];

  constructor(camera: Camera, opaqueQueue: RenderQueue, alphaTestQueue: RenderQueue, transparentQueue: RenderQueue) {
    this._camera = camera;
    this._opaqueQueue = opaqueQueue;
    this._alphaTestQueue = alphaTestQueue;
    this._transparentQueue = transparentQueue;

    this._shadowMapMaterial = new ShadowMapMaterial(camera.engine);
    this._updateShadowSettings();
  }

  /**
   * @internal
   */
  _render() {
    this._updateShadowSettings();
    this._depthMap.length = 0;
    this._shadowMapCount = 0;
    this._renderDirectShadowMap();

    const shadowMapCount = this._shadowMapCount;
    if (shadowMapCount) {
      this._updateShaderData();
    }

    const renderers = this._camera.engine._componentsManager._renderers;
    const elements = renderers._elements;
    for (let i = renderers.length - 1; i >= 0; --i) {
      const renderer = elements[i];
      const shaderData = renderer.shaderData;
      shaderData.disableMacro("CASCADED_SHADOW_MAP_COUNT");
      if (shadowMapCount && renderer.receiveShadows) {
        shaderData.enableMacro("CASCADED_SHADOW_MAP_COUNT", shadowMapCount.toString());
      }
    }
  }

  private _renderDirectShadowMap() {
    const {
      _camera: camera,
      _frustums: frustums,
      _opaqueQueue: opaqueQueue,
      _alphaTestQueue: alphaTestQueue,
      _transparentQueue: transparentQueue,
      _shadowMapMaterial: shadowMapMaterial,
      _shadowMapCount: shadowMapCount,
      _viewport: viewport
    } = this;
    const { engine, scene } = camera;
    const lights = engine._lightManager._directLights;
    const componentsManager = engine._componentsManager;
    const rhi = engine._hardwareRenderer;
    const shadowCascades = engine.settings.shadowCascades;
    const viewProjMatrix = CascadedShadowCaster._tempViewMatrix;

    this._updateCascadeSplitLambda();
    if (lights.length > 0) {
      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt = lights.get(i);
        if (lgt.enableShadow && shadowMapCount < CascadedShadowCaster.MAX_SHADOW) {
          const renderTarget = this._getAvailableRenderTarget(shadowCascades);
          rhi.activeRenderTarget(renderTarget, null, 0);
          rhi.clearRenderTarget(camera.engine, CameraClearFlags.Depth, null);

          this._updateCascadesShadow(shadowMapCount, lgt);
          for (let j = 0; j < shadowCascades; j++) {
            const vpMatrixBegin = shadowMapCount * 64 + 16 * j;
            viewProjMatrix.copyFromArray(this._vpMatrix.subarray(vpMatrixBegin, vpMatrixBegin + 16));
            frustums.calculateFromMatrix(viewProjMatrix);
            scene.shaderData.setMatrix(CascadedShadowCaster._lightViewProjMatProperty, viewProjMatrix);

            opaqueQueue.clear();
            alphaTestQueue.clear();
            transparentQueue.clear();
            const renderers = componentsManager._renderers;
            const elements = renderers._elements;
            for (let k = renderers.length - 1; k >= 0; --k) {
              ShadowUtils.shadowCullFrustum(camera, elements[k], frustums);
            }
            opaqueQueue.sort(RenderQueue._compareFromNearToFar);
            alphaTestQueue.sort(RenderQueue._compareFromNearToFar);

            rhi.viewport(viewport[j].x, viewport[j].y, viewport[j].z, viewport[j].w);
            opaqueQueue.render(camera, shadowMapMaterial, Layer.Everything);
            alphaTestQueue.render(camera, shadowMapMaterial, Layer.Everything);
          }
          this._shadowMapCount++;
        }
      }
    }
  }

  private _updateShaderData() {
    const shaderData = this._camera.scene.shaderData;
    shaderData.setFloatArray(CascadedShadowCaster._viewProjMatFromLightProperty, this._vpMatrix);
    shaderData.setFloatArray(CascadedShadowCaster._shadowInfosProperty, this._shadowInfos);
    shaderData.setTextureArray(CascadedShadowCaster._shadowMapsProperty, this._depthMap);
  }

  private _updateCascadesShadow(shadowIndex: number, light: DirectLight) {
    const { _cascadeSplitRatio: cascadeSplitRatio, _camera: camera } = this;
    const shadowCascades = camera.engine.settings.shadowCascades;

    const viewMatrix = CascadedShadowCaster._tempViewMatrix;
    const projMatrix = CascadedShadowCaster._tempProjMatrix;
    const vector = CascadedShadowCaster._tempVector;
    const worldPos = CascadedShadowCaster._tempWorldPos;
    worldPos.copyFrom(light.entity.transform.worldPosition);

    this._shadowInfos[shadowIndex * 4] = light.shadowBias;
    this._shadowInfos[shadowIndex * 4 + 1] = light.shadowStrength;
    this._shadowInfos[shadowIndex * 4 + 2] = light.shadowRadius;
    this._shadowInfos[shadowIndex * 4 + 3] = 1;
    this._depthMap.push(<Texture2D>this._renderTargets[shadowIndex].depthTexture);

    const frustumCorners = [
      new Vector3(-1.0, 1.0, -1.0),
      new Vector3(1.0, 1.0, -1.0),
      new Vector3(1.0, -1.0, -1.0),
      new Vector3(-1.0, -1.0, -1.0),
      new Vector3(-1.0, 1.0, 1.0),
      new Vector3(1.0, 1.0, 1.0),
      new Vector3(1.0, -1.0, 1.0),
      new Vector3(-1.0, -1.0, 1.0)
    ];

    // Project frustum corners into world space
    Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, viewMatrix);
    const invCam = viewMatrix.invert();
    for (let i = 0; i < 8; i++) {
      Vector3.transformCoordinate(frustumCorners[i], invCam, frustumCorners[i]);
    }

    // Calculate orthographic projection matrix for each cascade
    let lastSplitDist = 0.0;
    for (let i = 0; i < shadowCascades; i++) {
      const splitDist = cascadeSplitRatio[i];
      const _frustumCorners = CascadedShadowCaster._frustumCorners;
      for (let j = 0; j < 4; j++) {
        Vector3.subtract(frustumCorners[j + 4], frustumCorners[j], vector);
        _frustumCorners[j + 4].copyFrom(frustumCorners[j]);
        _frustumCorners[j + 4].add(vector.scale(splitDist));

        _frustumCorners[j].copyFrom(frustumCorners[j]);
        _frustumCorners[j].add(vector.scale(lastSplitDist / splitDist));
      }

      const lightMat = light.entity.transform.worldMatrix;
      Matrix.invert(lightMat, viewMatrix);
      for (let j = 0; j < 8; j++) {
        Vector3.transformCoordinate(_frustumCorners[j], viewMatrix, _frustumCorners[j]);
      }
      const farDist = Vector3.distance(_frustumCorners[7], _frustumCorners[5]);
      const crossDist = Vector3.distance(_frustumCorners[7], _frustumCorners[1]);
      const maxDist = farDist > crossDist ? farDist : crossDist;

      let minX = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE;
      let minY = Number.MAX_VALUE;
      let maxY = -Number.MAX_VALUE;
      let minZ = Number.MAX_VALUE;
      let maxZ = -Number.MAX_VALUE;
      for (let j = 0; j < 8; j++) {
        minX = Math.min(minX, _frustumCorners[j].x);
        maxX = Math.max(maxX, _frustumCorners[j].x);
        minY = Math.min(minY, _frustumCorners[j].y);
        maxY = Math.max(maxY, _frustumCorners[j].y);
        minZ = Math.min(minZ, _frustumCorners[j].z);
        maxZ = Math.max(maxZ, _frustumCorners[j].z);
      }

      // texel tile
      const fWorldUnitsPerTexel = maxDist / this._shadowMapResolution;
      let posX = (minX + maxX) * 0.5;
      posX /= fWorldUnitsPerTexel;
      posX = Math.floor(posX);
      posX *= fWorldUnitsPerTexel;

      let posY = (minY + maxY) * 0.5;
      posY /= fWorldUnitsPerTexel;
      posY = Math.floor(posY);
      posY *= fWorldUnitsPerTexel;

      let posZ = maxZ;
      posZ /= fWorldUnitsPerTexel;
      posZ = Math.floor(posZ);
      posZ *= fWorldUnitsPerTexel;

      vector.set(posX, posY, posZ);
      Vector3.transformCoordinate(vector, lightMat, vector);
      light.entity.transform.worldPosition = vector;

      const radius = maxDist / 2.0;
      Matrix.ortho(-radius, radius, -radius, radius, 0, maxZ - minZ, projMatrix);

      // Store split distance and matrix in cascade
      Matrix.invert(light.entity.transform.worldMatrix, viewMatrix);
      Matrix.multiply(projMatrix, viewMatrix, viewMatrix);
      this._vpMatrix.set(viewMatrix.elements, shadowIndex * 64 + 16 * i);
      light.entity.transform.worldPosition = worldPos;
      lastSplitDist = cascadeSplitRatio[i];
    }
  }

  private _updateCascadeSplitLambda() {
    const camera = this._camera;
    const { shadowCascades, shadowCascadeSplitRatio } = camera.engine.settings;

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
    const cascadeSplits = this._cascadeSplits;
    switch (shadowCascades) {
      case ShadowCascadesMode.NoCascades:
        cascadeSplits.set(-farClip, -farClip, -farClip, -farClip);
        break;
      case ShadowCascadesMode.TwoCascades:
        cascadeSplits.set(
          -(nearClip + this._cascadeSplitRatio[0] * clipRange),
          -(nearClip + this._cascadeSplitRatio[1] * clipRange),
          -farClip,
          -farClip
        );
        break;
      case ShadowCascadesMode.FourCascades:
        cascadeSplits.set(
          -(nearClip + this._cascadeSplitRatio[0] * clipRange),
          -(nearClip + this._cascadeSplitRatio[1] * clipRange),
          -(nearClip + this._cascadeSplitRatio[2] * clipRange),
          -(nearClip + this._cascadeSplitRatio[3] * clipRange)
        );
    }
    camera.shaderData.setVector4(CascadedShadowCaster._shadowCascadeProperty, cascadeSplits);
  }

  private _getAvailableRenderTarget(cascadeMode: ShadowCascadesMode): RenderTarget {
    const engine = this._camera.engine;
    const format = this._shadowMapFormat;
    let width = this._shadowMapResolution;
    let height = this._shadowMapResolution;
    switch (cascadeMode) {
      case ShadowCascadesMode.TwoCascades:
        width *= 2;
        break;
      case ShadowCascadesMode.FourCascades:
        width *= 2;
        height *= 2;
        break;
    }

    let renderTarget = this._renderTargets[this._shadowMapCount];
    if (
      renderTarget == null ||
      renderTarget?.depthTexture.width !== width ||
      renderTarget?.depthTexture.height !== height ||
      renderTarget?.depthTexture.format !== format
    ) {
      const depthTexture = new Texture2D(engine, width, height, format, false);
      depthTexture.wrapModeV = depthTexture.wrapModeU = TextureWrapMode.Clamp;

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

  private _updateShadowSettings() {
    const settings = this._camera.engine.settings;
    const shadowFormat = ShadowUtils.shadowDepthFormat(settings.shadowResolution);
    const shadowResolution = ShadowUtils.shadowResolution(settings.shadowResolution);
    const shadowCascades = settings.shadowCascades;
    if (
      shadowFormat !== this._shadowMapFormat ||
      shadowResolution !== this._shadowMapResolution ||
      shadowCascades !== this._shadowCascadeMode
    ) {
      this._shadowMapFormat = shadowFormat;
      this._shadowMapResolution = shadowResolution;
      this._shadowCascadeMode = shadowCascades;
      this._renderTargets.length = 0;

      const viewport = this._viewport;
      switch (shadowCascades) {
        case ShadowCascadesMode.NoCascades:
          viewport[0].set(0, 0, shadowResolution, shadowResolution);
          break;
        case ShadowCascadesMode.TwoCascades:
          viewport[0].set(0, 0, shadowResolution, shadowResolution);
          viewport[1].set(shadowResolution, 0, shadowResolution, shadowResolution);
          break;
        case ShadowCascadesMode.FourCascades:
          viewport[0].set(0, 0, shadowResolution, shadowResolution);
          viewport[1].set(shadowResolution, 0, shadowResolution, shadowResolution);
          viewport[2].set(0, shadowResolution, shadowResolution, shadowResolution);
          viewport[3].set(shadowResolution, shadowResolution, shadowResolution, shadowResolution);
      }
    }
  }
}
