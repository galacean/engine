import { Camera } from "../Camera";
import { Layer } from "../Layer";
import { RenderQueue } from "../RenderPipeline/RenderQueue";
import { ShadowMapMaterial } from "./ShadowMapMaterial";
import { BoundingFrustum, Color, Matrix } from "@oasis-engine/math";
import { Shader } from "../shader";
import { RenderTarget, Texture2D } from "../texture";
import { Light } from "../lighting";
import { CameraClearFlags } from "../enums/CameraClearFlags";

/**
 * Shadow manager.
 */
export class ShadowManager {
  private static _lightViewMatProperty = Shader.getPropertyByName("u_lightViewMat");
  private static _lightProjMatProperty = Shader.getPropertyByName("u_lightProjMat");

  private static _viewProjMatrix = new Matrix();
  private static _viewMatFromLightProperty = Shader.getPropertyByName("u_viewMatFromLight");
  private static _projMatFromLightProperty = Shader.getPropertyByName("u_projMatFromLight");
  private static _shadowBiasProperty = Shader.getPropertyByName("u_shadowBias");
  private static _shadowIntensityProperty = Shader.getPropertyByName("u_shadowIntensity");
  private static _shadowRadiusProperty = Shader.getPropertyByName("u_shadowRadius");
  private static _shadowMapsProperty = Shader.getPropertyByName("u_shadowMaps");

  private readonly _mapSize: number = 512;
  private readonly _maxLight: number = 3;
  private readonly _opaqueQueue: RenderQueue;
  private readonly _transparentQueue: RenderQueue;
  private readonly _alphaTestQueue: RenderQueue;
  private readonly _camera: Camera;
  private _shadowMapMaterial: ShadowMapMaterial;
  private _frustums = new BoundingFrustum();
  private _shadowMapCount = 0;
  private _clearColor = new Color();

  private _combinedData = {
    viewMatrix: new Float32Array(16 * this._maxLight),
    projectionMatrix: new Float32Array(16 * this._maxLight),
    bias: new Float32Array(this._maxLight),
    intensity: new Float32Array(this._maxLight),
    radius: new Float32Array(this._maxLight),
    map: new Array<Texture2D>(1) // todo
  };
  private _renderTargets = new Array<RenderTarget>(1); // todo

  constructor(camera: Camera, opaqueQueue: RenderQueue, alphaTestQueue: RenderQueue, transparentQueue: RenderQueue) {
    this._camera = camera;
    this._opaqueQueue = opaqueQueue;
    this._alphaTestQueue = alphaTestQueue;
    this._transparentQueue = transparentQueue;
  }

  /**
   * Clear all shadow maps.
   */
  clearMap() {
    this._combinedData.map.length = 0;
  }

  /**
   * Render ShadowMap
   */
  render() {
    // render shadowMap
    this._shadowMapCount = 0;
    this._renderSpotShadowMap();

    // upload shadow data
    const shadowMapCount = this._shadowMapCount;
    if (shadowMapCount) {
      this._updateShaderData();
      this._camera.scene.shaderData.enableMacro("O3_SHADOW_MAP_COUNT", shadowMapCount.toString());
    } else {
      this._camera.scene.shaderData.disableMacro("O3_SHADOW_MAP_COUNT");
    }
  }

  private _renderSpotShadowMap() {
    const {
      _camera: camera,
      _mapSize: mapSize,
      _frustums: frustums,
      _opaqueQueue: opaqueQueue,
      _alphaTestQueue: alphaTestQueue,
      _transparentQueue: transparentQueue
    } = this;
    const { engine, scene } = camera;
    const lights = engine._lightManager._spotLights;
    const componentsManager = engine._componentsManager;
    const rhi = engine._hardwareRenderer;

    if (lights.length > 0) {
      for (let i = 0, len = lights.length; i < len; i++) {
        const lgt = lights.get(i);
        if (lgt.enableShadow) {
          let renderTarget = this._renderTargets[this._shadowMapCount];
          if (renderTarget == null) {
            renderTarget = this._renderTargets[this._shadowMapCount] = new RenderTarget(
              engine,
              mapSize,
              mapSize,
              new Texture2D(engine, mapSize, mapSize)
            );
          }
          rhi.activeRenderTarget(renderTarget, camera, null);
          rhi.clearRenderTarget(camera.engine, CameraClearFlags.Depth, this._clearColor);

          opaqueQueue.clear();
          alphaTestQueue.clear();
          transparentQueue.clear();
          Matrix.multiply(lgt._shadowProjectionMatrix, lgt.viewMatrix, ShadowManager._viewProjMatrix);
          frustums.calculateFromMatrix(ShadowManager._viewProjMatrix);
          const renderers = componentsManager._renderers;
          const elements = renderers._elements;
          for (let i = renderers.length - 1; i >= 0; --i) {
            const renderer = elements[i];
            // filter by renderer castShadow and frustum cull
            if (renderer.castShadows && frustums.intersectsBox(renderer.bounds)) {
              renderer._render(null);
            }
          }
          opaqueQueue.sort(RenderQueue._compareFromNearToFar);
          alphaTestQueue.sort(RenderQueue._compareFromNearToFar);
          transparentQueue.sort(RenderQueue._compareFromFarToNear);

          scene.shaderData.setMatrix(ShadowManager._lightViewMatProperty, lgt.viewMatrix);
          scene.shaderData.setMatrix(ShadowManager._lightProjMatProperty, lgt._shadowProjectionMatrix);

          this._shadowMapMaterial = this._shadowMapMaterial || new ShadowMapMaterial(camera.engine);
          const shadowMapMaterial = this._shadowMapMaterial;
          opaqueQueue.render(camera, shadowMapMaterial, Layer.Everything);
          alphaTestQueue.render(camera, shadowMapMaterial, Layer.Everything);
          transparentQueue.render(camera, shadowMapMaterial, Layer.Everything);
          // shader data
          this._appendData(this._shadowMapCount++, lgt);
        }
      }
    }
  }

  private _appendData(lightIndex: number, light: Light): void {
    const viewStart = lightIndex * 16;
    const projectionStart = lightIndex * 16;
    const biasStart = lightIndex;
    const intensityStart = lightIndex;
    const radiusStart = lightIndex;
    const mapStart = lightIndex;

    const data = this._combinedData;

    data.viewMatrix.set(light.viewMatrix.elements, viewStart);
    data.projectionMatrix.set(light._shadowProjectionMatrix.elements, projectionStart);
    data.bias[biasStart] = light.shadowBias;
    data.intensity[intensityStart] = light.shadowStrength;
    data.radius[radiusStart] = light.shadowRadius;
    data.map[mapStart] = <Texture2D>this._renderTargets[lightIndex].getColorTexture();
  }

  private _updateShaderData() {
    const data = this._combinedData;
    const shaderData = this._camera.scene.shaderData;

    shaderData.setFloatArray(ShadowManager._viewMatFromLightProperty, data.viewMatrix);
    shaderData.setFloatArray(ShadowManager._projMatFromLightProperty, data.projectionMatrix);
    shaderData.setFloatArray(ShadowManager._shadowBiasProperty, data.bias);
    shaderData.setFloatArray(ShadowManager._shadowIntensityProperty, data.intensity);
    shaderData.setFloatArray(ShadowManager._shadowRadiusProperty, data.radius);
    shaderData.setTextureArray(ShadowManager._shadowMapsProperty, data.map);
  }
}
