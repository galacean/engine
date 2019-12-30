import * as glue from "../glue-ability/Camera";
import { Plugin } from "./Plugin";
export const defaultCameraPlugin: Plugin = oasis => {
  return {
    abilityAdded: ability => {
      if (ability instanceof glue.Camera) {
        ability.attachToScene(oasis.canvas, oasis.options.rhiAttr);
      }
    }
  };
};
