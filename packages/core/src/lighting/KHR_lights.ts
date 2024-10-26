import { AmbientLight } from "./AmbientLight";
import { DirectLight } from "./DirectLight";
import { PointLight } from "./PointLight";
import { SpotLight } from "./SpotLight";
import { Logger } from "../base";

class KHR_lights {
  static parseLights(lights) {
    const results = [];

    for (let i = 0; i < lights.length; i++) {
      const { name, type, spot } = lights[i];
      let { color, intensity } = lights[i];
      let component;
      let props;
      color = color ? color : [1, 1, 1];
      intensity = intensity === undefined ? 1 : intensity;
      switch (type) {
        case "ambient":
          component = AmbientLight;
          props = { name, color, intensity };
          break;
        case "directional":
          component = DirectLight;
          props = { name, color, intensity };
          break;
        case "point":
          component = PointLight;
          props = { name, color, intensity };
          break;
        case "spot":
          component = SpotLight;
          props = { name, color, intensity, angle: spot.outerConeAngle };
          break;
        default:
          Logger.error(`unknown light typ ${type}`);
          break;
      }

      if (component) {
        results[i] = { component, props };
      }
    }
    return results;
  }
}

export { KHR_lights };
