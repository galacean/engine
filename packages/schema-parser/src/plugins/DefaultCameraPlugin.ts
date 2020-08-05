import { Camera, Vector3 } from "@alipay/o3";
import { Plugin } from "./Plugin";
export const defaultCameraPlugin: Plugin = (oasis) => {
  const position: Vector3 = new Vector3();
  const rotation: Vector3 = new Vector3();
  return {
    beforeAbilityAdded: (conf) => {
      if (conf.type === "Camera") {
        const p = oasis.options.config.nodes[conf.node].position;
        const r = oasis.options.config.nodes[conf.node].rotation;

        position.setValue(p[0], p[1], p[2]);
        rotation.setValue(r[0], r[1], r[2]);
      }
    },
    abilityAdded: (ability) => {
      if (ability instanceof Camera) {
        // ability.attachToScene(oasis.canvas, oasis.options.rhiAttr);
        if (ability instanceof Camera) {
          ability.entity.transform.position = position;
          ability.entity.transform.rotation = rotation;
        }
      }
    }
  };
};
