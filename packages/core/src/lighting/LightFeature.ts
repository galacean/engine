import { Logger } from "../base/Logger";
import { SceneFeature } from "../SceneFeature";
import { Shader } from "../shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderMacro } from "../shader/ShaderMacro";
import { AmbientLight } from "./AmbientLight";
import { DirectLight } from "./DirectLight";
import { EnvironmentMapLight } from "./EnvironmentMapLight";
import { Light } from "./Light";
import { PointLight } from "./PointLight";
import { SpotLight } from "./SpotLight";

/**
 * Determine whether there are lights in the scene.
 * @returns Has light
 */
export function hasLight(): boolean {
  return this.findFeature(LightFeature).visibleLights.length > 0;
}

/**
 * Light plug-in.
 */
export class LightFeature extends SceneFeature {
  private static _ambientMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_AMBIENT_LIGHT");
  private static _envMacro: ShaderMacro = Shader.getMacroByName("O3_HAS_ENVMAP_LIGHT");

  visibleLights: Light[];

  constructor() {
    super();
    this.visibleLights = [];
  }

  /**
   * Register a light object to the current scene.
   * @param light
   */
  attachRenderLight(light: Light): void {
    const index = this.visibleLights.indexOf(light);
    if (index == -1) {
      this.visibleLights.push(light);
    } else {
      Logger.warn("Light already attached.");
    }
  }

  /**
   * Remove a light object from the current scene.
   * @param light
   */
  detachRenderLight(light: Light): void {
    const index = this.visibleLights.indexOf(light);
    if (index != -1) {
      this.visibleLights.splice(index, 1);
    }
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData) {
    /**
     * ambientLight and envMapLight only use the last one in the scene
     * */
    let ambientLightCount = 0;
    let envMapLightCount = 0;
    let directLightCount = 0;
    let pointLightCount = 0;
    let spotLightCount = 0;

    let lights = this.visibleLights;
    for (let i = 0, len = lights.length; i < len; i++) {
      const light = lights[i];
      if (light instanceof AmbientLight) {
        ambientLightCount++;
      } else if (light instanceof EnvironmentMapLight) {
        EnvironmentMapLight._updateShaderData(shaderData, light);
        envMapLightCount++;
      } else if (light instanceof DirectLight) {
        light._appendData(directLightCount++);
      } else if (light instanceof PointLight) {
        light._appendData(pointLightCount++);
      } else if (light instanceof SpotLight) {
        light._appendData(spotLightCount++);
      }
    }

    if (ambientLightCount) {
      shaderData.enableMacro(LightFeature._ambientMacro);
    } else {
      shaderData.disableMacro(LightFeature._ambientMacro);
    }

    if (envMapLightCount) {
      shaderData.enableMacro(LightFeature._envMacro);
    } else {
      shaderData.disableMacro(LightFeature._envMacro);
    }

    if (directLightCount) {
      DirectLight._updateShaderData(shaderData);
      shaderData.enableMacro("O3_DIRECT_LIGHT_COUNT", directLightCount.toString());
    } else {
      shaderData.disableMacro("O3_DIRECT_LIGHT_COUNT");
    }

    if (pointLightCount) {
      PointLight._updateShaderData(shaderData);
      shaderData.enableMacro("O3_POINT_LIGHT_COUNT", pointLightCount.toString());
    } else {
      shaderData.disableMacro("O3_POINT_LIGHT_COUNT");
    }

    if (spotLightCount) {
      SpotLight._updateShaderData(shaderData);
      shaderData.enableMacro("O3_SPOT_LIGHT_COUNT", spotLightCount.toString());
    } else {
      shaderData.disableMacro("O3_SPOT_LIGHT_COUNT");
    }
  }
}
