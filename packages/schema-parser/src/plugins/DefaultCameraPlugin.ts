import { PluginHook } from "./PluginManager";
import * as o3 from "@alipay/o3";
import * as glue from "../glue-ability/Camera";
import { Oasis } from "../Oasis";
export class DefaultCameraPlugin implements PluginHook {
  oasis: Oasis;
  abilityAdded(ability: o3.NodeAbility) {
    if (ability instanceof glue.Camera) {
      // console.log("camera added")
      ability.attachToScene(this.oasis.canvas);
    }
  }
}
