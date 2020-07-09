import { Logger } from "@alipay/o3-base";
import { AmbientLight } from "./AmbientLight";
import { DirectLight } from "./DirectLight";
import { PointLight } from "./PointLight";
import { SpotLight } from "./SpotLight";

class KHR_lights {
  static parseLights(lights) {
    const results = [];

    for (let i = 0; i < lights.length; i++) {
      const { name, type, spot } = lights[i];
      let { color, intensity } = lights[i];
      let ability;
      let props;
      color = color ? color : [1, 1, 1];
      intensity = intensity === undefined ? 1 : intensity;
      switch (type) {
        case "ambient":
          ability = AmbientLight;
          props = { name, color, intensity };
          break;
        case "directional":
          ability = DirectLight;
          props = { name, color, intensity };
          break;
        case "point":
          ability = PointLight;
          props = { name, color, intensity };
          break;
        case "spot":
          ability = SpotLight;
          props = { name, color, intensity, angle: spot.outerConeAngle };
          break;
        default:
          Logger.error(`unknow light typ ${type}`);
          break;
      }

      if (ability) {
        results[i] = { ability, props };
      }
    }
    return results;
  }
}

export { KHR_lights };
