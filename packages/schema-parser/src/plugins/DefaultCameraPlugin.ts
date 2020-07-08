import { Camera, OldCamera, vec3 } from "@alipay/o3";
import { Plugin } from "./Plugin";
export const defaultCameraPlugin: Plugin = (oasis) => {
  const position = [];
  const rotation = [];
  return {
    beforeAbilityAdded: (conf) => {
      if (conf.type === "Camera") {
        vec3.copy(position, oasis.options.config.nodes[conf.node].position);
        vec3.copy(rotation, oasis.options.config.nodes[conf.node].rotation);
      }
    },
    abilityAdded: (ability) => {
      if (ability instanceof Camera || ability instanceof OldCamera) {
        ability.attachToScene(oasis.canvas, oasis.options.rhiAttr);
        if (ability instanceof Camera) {
          ability.node.transform.position = position;
          ability.node.transform.rotation = rotation;
        }
      }
    }
  };
};
