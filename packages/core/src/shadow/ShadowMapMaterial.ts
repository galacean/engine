import { Engine } from "../Engine";
import { Material } from "../material";
import { Shader } from "../shader";
import { Light } from "../lighting";

/**
 * Shadow Map material.
 */
export class ShadowMapMaterial extends Material {
  private static _lightViewMatProperty = Shader.getPropertyByName("u_lightViewMat");
  private static _lightProjMatProperty = Shader.getPropertyByName("u_lightProjMat");

  private _light: Light;

  get light(): Light {
    return this._light;
  }

  set light(value: Light) {
    this._light = value;
    const shaderData = this.shaderData;
    shaderData.setMatrix(ShadowMapMaterial._lightViewMatProperty, value.viewMatrix);
    shaderData.setMatrix(ShadowMapMaterial._lightProjMatProperty, value.shadowProjectionMatrix);
  }

  constructor(engine: Engine) {
    const isWebGL2: boolean = engine._hardwareRenderer.isWebGL2;
    if (isWebGL2) {
      super(engine, Shader.find("shadow-map"));
    } else {
      super(engine, Shader.find("shadow-map"));
    }
  }
}
