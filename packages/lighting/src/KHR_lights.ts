import {Logger} from '@alipay/o3-base';
import {AAmbientLight} from './AAmbientLight';
import {ADirectLight} from './ADirectLight';
import {APointLight} from './APointLight';
import {ASpotLight} from './ASpotLight';

class KHR_lights {

  static parseLights(lights) {

    const results = [];

    for (let i = 0; i < lights.length; i++) {

      const {name, type, spot} = lights[i];
      let {color, intensity} = lights[i];
      let ability;
      let props;
      color = color ? color : [1, 1, 1];
      intensity = intensity === undefined ? 1 : intensity;
      switch (type) {

        case 'ambient':
          ability = AAmbientLight;
          props = {name, color, intensity};
          break;
        case 'directional':
          ability = ADirectLight;
          props = {name, color, intensity};
          break;
        case 'point':
          ability = APointLight;
          props = {name, color, intensity};
          break;
        case 'spot':
          ability = ASpotLight;
          props = {name, color, intensity, angle: spot.outerConeAngle};
          break;
        default:
          Logger.error(`unknow light typ ${type}`);
          break;

      }

      if (ability) {

        results[i] = {ability, props};

      }

    }
    return results;
  }

}

export {KHR_lights};
