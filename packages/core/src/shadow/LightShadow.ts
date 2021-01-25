import { MathUtil, Matrix, Vector2 } from "@oasis-engine/math";
import { DirectLight } from "../lighting/DirectLight";
import { Light } from "../lighting/Light";
import { PointLight } from "../lighting/PointLight";
import { SpotLight } from "../lighting/SpotLight";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { RenderColorTexture } from "../texture/RenderColorTexture";
import { RenderTarget } from "../texture/RenderTarget";

/**
 * Shadow manager.
 */
export class LightShadow {
  private static _viewMatFromLightProperty = Shader.getPropertyByName("u_viewMatFromLight");
  private static _projMatFromLightProperty = Shader.getPropertyByName("u_projMatFromLight");
  private static _shadowBiasProperty = Shader.getPropertyByName("u_shadowBias");
  private static _shadowIntensityProperty = Shader.getPropertyByName("u_shadowIntensity");
  private static _shadowRadiusProperty = Shader.getPropertyByName("u_shadowRadius");
  private static _shadowMapSizeProperty = Shader.getPropertyByName("u_shadowMapSize");
  private static _shadowMapsProperty = Shader.getPropertyByName("u_shadowMaps");

  /**
   * @internal
   */
  static _updateShaderData(shaderData: ShaderData) {
    const data = LightShadow._combinedData;

    shaderData.setFloatArray(LightShadow._viewMatFromLightProperty, data.viewMatrix);
    shaderData.setFloatArray(LightShadow._projMatFromLightProperty, data.projectionMatrix);
    shaderData.setFloatArray(LightShadow._shadowBiasProperty, data.bias);
    shaderData.setFloatArray(LightShadow._shadowIntensityProperty, data.intensity);
    shaderData.setFloatArray(LightShadow._shadowRadiusProperty, data.radius);
    shaderData.setFloatArray(LightShadow._shadowMapSizeProperty, data.mapSize);
    shaderData.setTextureArray(LightShadow._shadowMapsProperty, data.map);
  }

  /**
   * Clear all shadow maps.
   */
  static clearMap() {
    LightShadow._combinedData.map.length = 0;
  }

  private static _maxLight = 3;

  private static _combinedData = {
    viewMatrix: new Float32Array(16 * LightShadow._maxLight),
    projectionMatrix: new Float32Array(16 * LightShadow._maxLight),
    bias: new Float32Array(LightShadow._maxLight),
    intensity: new Float32Array(LightShadow._maxLight),
    radius: new Float32Array(LightShadow._maxLight),
    mapSize: new Float32Array(2 * LightShadow._maxLight),
    map: []
  };

  private _mapSize: Vector2;
  private _renderTarget: RenderTarget;

  /**
   * Shadow's light.
   */
  readonly light: Light;

  /**
   * Shadow bias.
   */
  bias: number = 0.005;

  /**
   * Shadow intensity, the larger the value, the clearer and darker the shadow.
   */
  intensity: number = 0.2;

  /**
   * Pixel range used for shadow PCF interpolation.
   */
  radius: number = 1;

  /**
   * Generate the projection matrix used by the shadow map.
   */
  projectionMatrix: Matrix = new Matrix();

  constructor(light: Light, props = { engine: null, width: 512, height: 512 }) {
    this.light = light;
    const { engine, width, height } = props;

    this._mapSize = new Vector2(width, height);
    this._renderTarget = new RenderTarget(engine, width, height, new RenderColorTexture(engine, width, height));
  }

  /**
   * The RenderTarget corresponding to the shadow map.
   * @readonly
   */
  get renderTarget(): RenderTarget {
    return this._renderTarget;
  }

  /**
   * Shadow map's color render texture.
   * @readonly
   */
  get map(): RenderColorTexture {
    return this._renderTarget.getColorTexture();
  }

  /**
   * Shadow map size.
   * @readonly
   */
  get mapSize(): Vector2 {
    return this._mapSize;
  }

  /**
   * Initialize the projection matrix for lighting.
   * @param light - The light to generate shadow
   */
  initShadowProjectionMatrix(light: Light) {
    /**
     * Directional light projection matrix, the default coverage area is left: -5, right: 5, bottom: -5, up: 5, near: 0.5, far: 50.
     */
    if (light instanceof DirectLight) {
      Matrix.ortho(-5, 5, -5, 5, 0.1, 50, this.projectionMatrix);
    }

    /**
     * Point light projection matrix, default configuration: fov: 50, aspect: 1, near: 0.5, far: 50.
     */
    if (light instanceof PointLight) {
      Matrix.perspective(MathUtil.degreeToRadian(50), 1, 0.5, 50, this.projectionMatrix);
    }

    /**
     * Spotlight projection matrix, the default configuration: fov: this.angle * 2 * Math.sqrt(2), aspect: 1, near: 0.1, far: this.distance + 5
     */
    if (light instanceof SpotLight) {
      const fov = Math.min(Math.PI / 2, light.angle * 2 * Math.sqrt(2));
      Matrix.perspective(fov, 1, 0.1, light.distance + 5, this.projectionMatrix);
    }
  }

  appendData(lightIndex: number): void {
    const viewStart = lightIndex * 16;
    const projectionStart = lightIndex * 16;
    const biasStart = lightIndex;
    const intensityStart = lightIndex;
    const radiusStart = lightIndex;
    const mapSizeStart = lightIndex * 2;
    const mapStart = lightIndex;

    const data = LightShadow._combinedData;

    data.viewMatrix.set(this.light.viewMatrix.elements, viewStart);
    data.projectionMatrix.set(this.projectionMatrix.elements, projectionStart);
    data.bias[biasStart] = this.bias;
    data.intensity[intensityStart] = this.intensity;
    data.radius[radiusStart] = this.radius;
    data.mapSize[mapSizeStart] = this.mapSize.x;
    data.mapSize[mapSizeStart + 1] = this.mapSize.y;
    data.map[mapStart] = this.map;
  }
}
