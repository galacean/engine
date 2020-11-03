import { Component, Entity } from "@oasis-engine/core";
import { Oasis } from "../Oasis";
import { SchemaResource } from "../resources";
import { Plugin } from "./Plugin";
export class PluginManager implements PluginHook {
  private registeredPlugins: Set<Plugin> = new Set();
  private plugins: PluginHook[] = [];

  register(plugin: Plugin) {
    this.registeredPlugins.add(plugin);
  }

  boot(oasis: Oasis) {
    for (let plugin of this.registeredPlugins.values()) {
      if (typeof plugin === "function") {
        plugin = plugin(oasis);
      }
      this.plugins.push(plugin);
    }
  }

  reset() {
    this.registeredPlugins.clear();
    this.plugins = [];
  }

  nodeAdded(entity: Entity) {
    this.delegateMethod("nodeAdded", entity);
  }

  private delegateMethod(name: keyof PluginHook, ...args) {
    this.plugins.forEach((plugin) => plugin[name] && (plugin[name] as any)(...args));
  }
}

export interface PluginHook {
  oasis?: Oasis;
  nodeAdded?(entity: Entity): any;
  beforeNodeUpdated?(id: string, key: string, value: any): any;
  nodeUpdated?(updateConfig?: { id: string; key: string; value: any }): any;
  abilityAdded?(ability: Component): any;
  beforeAbilityAdded?(config: any): any;
  beforeAbilityUpdated?(id: string, key: string, value: any): any;
  abilityUpdated?(updateConfig?: { id: string; key: string; value: any }): any;
  schemaParsed?(): any;
  abilityDeleted?(id: string): any;
  beforeAbilityDeleted?(id: string): any;
  beforeNodeDeleted?(config: any): any;
  beforeResourceRemove?(id: string): any;
  resourceUpdated?(info: { resource: SchemaResource; id: string; key: string; value: any }): any;
  beforeResourceUpdate?(id: string, key: string, value: any): any;
  // todo type
  beforeResourceAdd?(resource: any): any;
  resourceAdded?(resource: any): any;
}

export function pluginHook(options: Partial<{ before: keyof PluginHook; after: keyof PluginHook }>): MethodDecorator {
  return function (target: any, propertyName: string, descriptor: TypedPropertyDescriptor<any>) {
    const method = descriptor.value;

    descriptor.value = function (...args: any[]) {
      options.before && this.oasis.pluginManager.delegateMethod(options.before, ...args);
      return Promise.resolve(method.apply(this, arguments)).then((returnObj) => {
        options.after && this.oasis.pluginManager.delegateMethod(options.after, returnObj);
        return returnObj;
      });
    };
  };
}
