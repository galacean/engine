import { ShadowCascadesMode } from "./enum/ShadowCascadesMode";
import { CameraClearFlags } from "../enums/CameraClearFlags";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { Layer } from "../Layer";
import { ShadowUtils } from "./ShadowUtils";
import { BoundingFrustum, Matrix, Vector3, Vector4 } from "@oasis-engine/math";
import { SpotLight } from "../lighting";
import { RenderTarget, Texture2D, TextureFormat, TextureWrapMode } from "../texture";
import { Camera } from "../Camera";
import { ShadowMapMaterial } from "./ShadowMapMaterial";
import { Shader } from "../shader";

/**
 * Spotlight shadow caster.
 */
export class SpotShadowCaster {
  private static _lightViewProjMatProperty = Shader.getPropertyByName("u_lightViewProjMat");

  private static _viewProjMatFromLightProperty = Shader.getPropertyByName("u_viewProjMatFromLight");
  private static _shadowInfosProperty = Shader.getPropertyByName("u_shadowInfos");
  private static _shadowMapsProperty = Shader.getPropertyByName("u_shadowMaps");
  private static _shadowCascadeProperty = Shader.getPropertyByName("u_cascade");

  private static _tempProjMatrix = new Matrix();
  private static _tempViewMatrix = new Matrix();
  private static _tempVector = new Vector3();
  private static _tempWorldPos = new Vector3();

  /** Max shadowMap count */
  static MAX_SHADOW = 10;

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
  private _vpMatrix = new Float32Array(64 * SpotShadowCaster.MAX_SHADOW);
  // bias, strength, radius, whether cascade
  private _shadowInfos = new Float32Array(4 * SpotShadowCaster.MAX_SHADOW);
  private _depthMap: Texture2D[] = [];
  private _renderTargets = new Array<RenderTarget>(SpotShadowCaster.MAX_SHADOW);
  private _viewport: Vector4[] = [new Vector4(), new Vector4(), new Vector4(), new Vector4()];

  constructor(camera: Camera, opaqueQueue: RenderQueue, alphaTestQueue: RenderQueue, transparentQueue: RenderQueue) {
    this._camera = camera;
    this._opaqueQueue = opaqueQueue;
    this._alphaTestQueue = alphaTestQueue;
    this._transparentQueue = transparentQueue;

    this._shadowMapMaterial = new ShadowMapMaterial(camera.engine);
    this._updateShadowSettings();
  }

  private _renderSpotShadowMap() {
    const {
      _camera: camera,
      _frustums: frustums,
      _opaqueQueue: opaqueQueue,
      _alphaTestQueue: alphaTestQueue,
      _transparentQueue: transparentQueue,
      _shadowMapMaterial: shadowMapMaterial,
      _shadowMapCount: shadowMapCount
    } = this;
    const { engine, scene } = camera;
    const lights = engine._lightManager._spotLights;
    const componentsManager = engine._componentsManager;
    const rhi = engine._hardwareRenderer;
    const viewProjMatrix = SpotShadowCaster._tempViewMatrix;

    if (lights.length > 0) {
      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt = lights.get(i);
        if (lgt.enableShadow && shadowMapCount < SpotShadowCaster.MAX_SHADOW) {
          rhi.activeRenderTarget(this._getAvailableRenderTarget(ShadowCascadesMode.NoCascades), null, 0);
          rhi.clearRenderTarget(camera.engine, CameraClearFlags.Depth, null);

          this._updateSpotShadow(shadowMapCount, lgt);
          frustums.calculateFromMatrix(viewProjMatrix);
          scene.shaderData.setMatrix(SpotShadowCaster._lightViewProjMatProperty, viewProjMatrix);

          opaqueQueue.clear();
          alphaTestQueue.clear();
          transparentQueue.clear();
          const renderers = componentsManager._renderers;
          const elements = renderers._elements;
          for (let i = renderers.length - 1; i >= 0; --i) {
            ShadowUtils.shadowCullFrustum(camera, elements[i], frustums);
          }
          opaqueQueue.sort(RenderQueue._compareFromNearToFar);
          alphaTestQueue.sort(RenderQueue._compareFromNearToFar);
          transparentQueue.sort(RenderQueue._compareFromFarToNear);

          opaqueQueue.render(camera, shadowMapMaterial, Layer.Everything);
          alphaTestQueue.render(camera, shadowMapMaterial, Layer.Everything);
          this._shadowMapCount++;
        }
      }
    }
  }

  private _updateSpotShadow(shadowIndex: number, light: SpotLight) {
    const viewProjMatrix = SpotShadowCaster._tempViewMatrix;
    Matrix.multiply(light._shadowProjectionMatrix, light.viewMatrix, viewProjMatrix);

    this._vpMatrix.set(viewProjMatrix.elements, shadowIndex * 64);
    this._shadowInfos[shadowIndex * 4] = light.shadowBias;
    this._shadowInfos[shadowIndex * 4 + 1] = light.shadowStrength;
    this._shadowInfos[shadowIndex * 4 + 2] = light.shadowRadius;
    this._shadowInfos[shadowIndex * 4 + 3] = 0;
    this._depthMap.push(<Texture2D>this._renderTargets[shadowIndex].depthTexture);
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
