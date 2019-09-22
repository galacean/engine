import * as r3 from "@alipay/o3";
import {getNodeById} from "../sceneLoader";

export function createScript(nodeId: string, script: { onStart?: Function, onUpdate?: Function }) {
  const node = getNodeById(nodeId);
  const ability = node.createAbility(r3.NodeAbility);
  script.onStart && (ability.onStart = script.onStart.bind(ability));
  script.onUpdate && (ability.onUpdate = script.onUpdate.bind(ability));
}
