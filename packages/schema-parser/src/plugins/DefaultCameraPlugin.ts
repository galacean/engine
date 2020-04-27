import { Camera } from "@alipay/o3";
import { Plugin } from "./Plugin";
export const defaultCameraPlugin: Plugin = oasis => {
  return {
    abilityAdded: ability => {
      if (ability instanceof Camera) {
        ability.attachToScene(oasis.canvas, oasis.options.rhiAttr);
      }
    }
  };
};
