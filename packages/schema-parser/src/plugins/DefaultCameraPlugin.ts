import { Camera, vec3 } from "@alipay/o3";
import { Plugin } from "./Plugin";
export const defaultCameraPlugin: Plugin = (oasis) => {
  const position = [];
  return {
    beforeAbilityAdded: (conf) => {
      if (conf.type === "Camera") {
        vec3.copy(position, oasis.options.config.nodes[conf.node].position);
      }
    },
    abilityAdded: (ability) => {
      if (ability instanceof Camera) {
        // ability.attachToScene(oasis.canvas, oasis.options.rhiAttr);
        if (ability instanceof Camera) {
          ability.node.transform.position = position;
        }
      }
    }
  };
};
