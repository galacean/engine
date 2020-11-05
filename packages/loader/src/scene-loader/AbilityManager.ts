import { Component, Logger, Model } from "@oasis-engine/core";
import { Oasis } from "./Oasis";
import { Parser } from "./Parser";
import { pluginHook } from "./plugins/PluginManager";
import { scriptAbility } from "./resources";
import { AbilityConfig, Props } from "./types";
import { switchElementsIndex } from "./utils";

export class AbilityManager {
  private abilityMap: { [id: string]: Component } = {};

  constructor(private oasis: Oasis) {}

  @pluginHook({ after: "abilityAdded", before: "beforeAbilityAdded" })
  public add(abilityConfig: AbilityConfig) {
    const { type, node: nodeId, props, id, index } = abilityConfig;

    const node = this.oasis.nodeManager.get(nodeId);
    const AbilityConstructor = this.getCompConstructor(type);
    if (!AbilityConstructor) {
      Logger.error(`${type} abiltiy is not defined`);
      return;
    }

    const abilityProps = this.mixPropsToExplicitProps(props);
    const ability = node.addComponent(AbilityConstructor);
    const { enabled } = abilityProps;
    if (enabled !== undefined) {
      ability.enabled = enabled;
    }

    if (type === "Model") {
      // TODO
      (ability as Model).initProps(abilityProps);
    } else {
      for (let k in abilityProps) {
        if (abilityProps[k] !== null) {
          ability[k] = abilityProps[k];
        }
      }
    }

    //@ts-ignore
    const abilityArray = node._components;
    const currentIndex = abilityArray.length - 1;
    switchElementsIndex(abilityArray, currentIndex, index);
    (ability as any).id = id;
    this.abilityMap[id] = ability;
    return ability;
  }

  @pluginHook({ before: "beforeAbilityUpdated", after: "abilityUpdated" })
  public update(id: string, key: string, value: any) {
    if (this.get(id).constructor.name === "Model") {
      // TODO
      if (value && this.checkIsAsset(value)) {
        (this.get(id) as Model).setProp(key, this.oasis.resourceManager.get(value.id).resource);
      } else {
        (this.get(id) as Model).setProp(key, value);
      }
    } else {
      if (value && this.checkIsAsset(value)) {
        this.get(id)[key] = this.oasis.resourceManager.get(value.id).resource;
      } else {
        this.get(id)[key] = value;
      }
    }

    return { id, key, value };
  }

  public get(id: string): Component {
    return this.abilityMap[id];
  }

  @pluginHook({ after: "abilityDeleted", before: "beforeAbilityDeleted" })
  public delete(id: string) {
    const ability = this.abilityMap[id];
    ability.destroy();
    delete this.abilityMap[id];
    return id;
  }

  private getCompConstructor(type: string) {
    const splits = type.split(".");
    // script
    if (splits[0] === "script") {
      return scriptAbility[splits[1]];
    }

    const constructor = Parser._components["o3"][type];
    if (!constructor) {
      throw new Error(`${type} is not defined`);
    }
    return constructor;
  }

  private mixPropsToExplicitProps(props: Props) {
    const explicitProps = { ...props };
    for (let k in props) {
      const prop = props[k];
      if (prop && this.checkIsAsset(prop)) {
        const res = this.oasis.resourceManager.get(prop.id);
        if (res) {
          explicitProps[k] = res.resource;
        } else {
          explicitProps[k] = null;
          Logger.warn(`AbilityManager: can't get asset "${k}", which id is ${prop.id}`);
        }
      }
    }
    return explicitProps;
  }

  private checkIsAsset(prop: any): boolean {
    return prop.type === "asset";
  }
}
