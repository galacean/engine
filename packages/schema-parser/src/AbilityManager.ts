import * as o3 from "@alipay/o3";
import { Oasis } from "./Oasis";
import { pluginHook } from "./plugins/PluginManager";
import { switchElementsIndex } from "./utils";

export class AbilityManager {
  private abilityMap: { [id: string]: o3.NodeAbility } = {};

  constructor(private oasis: Oasis) {}

  @pluginHook({ after: "abilityAdded" })
  public add(abilityConfig: AbilityConfig) {
    const { type, nodeId, props, id, index } = abilityConfig;

    const node = this.oasis.nodeManager.get(nodeId);

    const AbilityConstructor = this.getConstructor(type);
    const ability = node.createAbility(AbilityConstructor, this.mixPropsToExplicitProps(props));
    const abilityArray = node.abilityArray;
    const currentIndex = abilityArray.length - 1;
    switchElementsIndex(abilityArray, currentIndex, index);
    this.abilityMap[id] = ability;
  }

  public update(id: string, key: string, value: any) {
    this.get(id)[key] = value;
  }

  public get(id: string): o3.NodeAbility {
    return this.abilityMap[id];
  }

  public delete(id: string) {}

  private getConstructor(type: string) {
    let namespace = o3;
    return namespace[type];
  }

  private mixPropsToExplicitProps(props: Props) {
    const explicitProps = { ...props };
    for (let k in props) {
      const prop = props[k];
      if (this.checkIsAsset(prop)) {
        const res = this.oasis.recourceManager.get(prop.id);
        explicitProps[k] = res.asset;
      }
    }
    return explicitProps;
  }

  private checkIsAsset(prop: any): boolean {
    return prop.type === "asset";
  }
}
