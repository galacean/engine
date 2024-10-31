import { ShaderData, ShaderProperty } from "../shader";
import { ShadowType } from "../shadow";
import { DisorderedArray } from "../utils/DisorderedArray";
import { DirectLight, IDirectLightShaderData } from "./DirectLight";
import { PointLight, IPointLightShaderData } from "./PointLight";
import { SpotLight, ISpotLightShaderData } from "./SpotLight";

/**
 * Light manager.
 */
export class LightManager {
  /** @internal */
  static _sunlightColorProperty = ShaderProperty.getByName("scene_SunlightColor");
  /** @internal */
  static _sunlightDirectionProperty = ShaderProperty.getByName("scene_SunlightDirection");
  /**
   * Each type of light source is at most 10, beyond which it will not take effect.
   * */
  private static _maxLight: number = 10;

  /** @internal */
  _spotLights: DisorderedArray<SpotLight> = new DisorderedArray();
  /** @internal */
  _pointLights: DisorderedArray<PointLight> = new DisorderedArray();
  /** @internal */
  _directLights: DisorderedArray<DirectLight> = new DisorderedArray();
  /** @internal */
  _sunlight: DirectLight | null;

  private _directData: IDirectLightShaderData = {
    cullingMask: new Int32Array(LightManager._maxLight * 2),
    color: new Float32Array(LightManager._maxLight * 3),
    direction: new Float32Array(LightManager._maxLight * 3)
  };

  private _pointData: IPointLightShaderData = {
    cullingMask: new Int32Array(LightManager._maxLight * 2),
    color: new Float32Array(LightManager._maxLight * 3),
    position: new Float32Array(LightManager._maxLight * 3),
    distance: new Float32Array(LightManager._maxLight)
  };

  private _spotData: ISpotLightShaderData = {
    cullingMask: new Int32Array(LightManager._maxLight * 2),
    color: new Float32Array(LightManager._maxLight * 3),
    position: new Float32Array(LightManager._maxLight * 3),
    direction: new Float32Array(LightManager._maxLight * 3),
    distance: new Float32Array(LightManager._maxLight),
    angleCos: new Float32Array(LightManager._maxLight),
    penumbraCos: new Float32Array(LightManager._maxLight)
  };

  /**
   * @internal
   */
  _attachSpotLight(light: SpotLight): void {
    light._lightIndex = this._spotLights.length;
    this._spotLights.add(light);
  }

  /**
   * @internal
   */
  _detachSpotLight(light: SpotLight): void {
    const replaced = this._spotLights.deleteByIndex(light._lightIndex);
    replaced && (replaced._lightIndex = light._lightIndex);
    light._lightIndex = -1;
  }

  /**
   * @internal
   */
  _attachPointLight(light: PointLight): void {
    light._lightIndex = this._pointLights.length;
    this._pointLights.add(light);
  }

  /**
   * @internal
   */
  _detachPointLight(light: PointLight): void {
    const replaced = this._pointLights.deleteByIndex(light._lightIndex);
    replaced && (replaced._lightIndex = light._lightIndex);
    light._lightIndex = -1;
  }

  /**
   * @internal
   */
  _attachDirectLight(light: DirectLight): void {
    light._lightIndex = this._directLights.length;
    this._directLights.add(light);
  }

  /**
   * @internal
   */
  _detachDirectLight(light: DirectLight): void {
    const replaced = this._directLights.deleteByIndex(light._lightIndex);
    replaced && (replaced._lightIndex = light._lightIndex);
    light._lightIndex = -1;
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    const { _spotLights: spotLight, _pointLights: pointLight, _directLights: directLight } = this;
    const { _spotData: spotData, _pointData: pointData, _directData: directData } = this;
    const maxLight = LightManager._maxLight;
    const spotLightCount = Math.min(spotLight.length, maxLight);
    const pointLightCount = Math.min(pointLight.length, maxLight);
    const directLightCount = Math.min(directLight.length, maxLight);

    for (let i = 0; i < spotLightCount; i++) {
      spotLight.get(i)._appendData(i, spotData);
    }

    for (let i = 0; i < pointLightCount; i++) {
      pointLight.get(i)._appendData(i, pointData);
    }

    for (let i = 0; i < directLightCount; i++) {
      directLight.get(i)._appendData(i, directData);
    }

    if (directLightCount) {
      DirectLight._updateShaderData(shaderData, directData);
      shaderData.enableMacro("SCENE_DIRECT_LIGHT_COUNT", directLightCount.toString());
    } else {
      shaderData.disableMacro("SCENE_DIRECT_LIGHT_COUNT");
    }

    if (pointLightCount) {
      PointLight._updateShaderData(shaderData, pointData);
      shaderData.enableMacro("SCENE_POINT_LIGHT_COUNT", pointLightCount.toString());
    } else {
      shaderData.disableMacro("SCENE_POINT_LIGHT_COUNT");
    }

    if (spotLightCount) {
      SpotLight._updateShaderData(shaderData, spotData);
      shaderData.enableMacro("SCENE_SPOT_LIGHT_COUNT", spotLightCount.toString());
    } else {
      shaderData.disableMacro("SCENE_SPOT_LIGHT_COUNT");
    }
  }

  /**
   * @internal
   */
  _gc() {
    this._spotLights.garbageCollection();
    this._pointLights.garbageCollection();
    this._directLights.garbageCollection();
  }

  /**
   * @internal
   */
  _updateSunlightIndex(light: DirectLight): void {
    const directLights = this._directLights;
    const index = light._lightIndex;

    // -1 means no sun light, 0 means the first direct light already is sun light
    if (index > 0) {
      const firstLight = directLights.get(0);
      const sunlight = directLights.get(index);
      directLights.set(0, sunlight);
      directLights.set(index, firstLight);

      sunlight._lightIndex = 0;
      firstLight._lightIndex = index;
    }
  }

  /**
   * @internal
   */
  _getMaxBrightestSunlight(): DirectLight | null {
    const directLights = this._directLights;

    let sunlight = null;
    let maxIntensity = Number.NEGATIVE_INFINITY;
    let hasShadowLight = false;
    for (let i = 0, n = directLights.length; i < n; i++) {
      const currentLight = directLights.get(i);
      if (currentLight.shadowType !== ShadowType.None && !hasShadowLight) {
        maxIntensity = Number.NEGATIVE_INFINITY;
        hasShadowLight = true;
      }
      const intensity = currentLight.intensity * currentLight.color.getBrightness();
      if (hasShadowLight) {
        if (currentLight.shadowType !== ShadowType.None && maxIntensity < intensity) {
          maxIntensity = intensity;
          sunlight = currentLight;
        }
      } else {
        if (maxIntensity < intensity) {
          maxIntensity = intensity;
          sunlight = currentLight;
        }
      }
    }
    return sunlight;
  }
}
