import { Plugin } from "./Plugin";
import * as o3 from "@alipay/o3";
import { Oasis } from "../Oasis";

export class PluginManager implements PluginHook {
  private registeredPlugins: Set<ClassType<Plugin>> = new Set();
  private plugins: Plugin[] = [];

  register<T extends Plugin>(pluginClass: ClassType<T>) {
    this.registeredPlugins.add(pluginClass);
  }

  boot(oasis: Oasis) {
    for (let PluginClass of this.registeredPlugins.values()) {
      this.plugins.push(new PluginClass(oasis));
    }
  }

  nodeAdded(node: o3.Node) {
    this.delegateMethod("nodeAdded", node);
  }

  abilityAdded(ability: o3.NodeAbility) {
    this.delegateMethod("abilityAdded", ability);
  }
  // todo type
  resourceAdded(resource: any) {
    this.delegateMethod("resourceAdded", resource);
  }

  private delegateMethod(name: keyof PluginHook, param: any) {
    this.plugins.forEach(plugin => plugin[name] && plugin[name]!(param));
  }
}

export interface PluginHook {
  nodeAdded(node: o3.Node): any;
  abilityAdded(ability: o3.NodeAbility): any;
  // todo type
  resourceAdded(resource: any): any;
}

export function pluginHook(options: Partial<{ before: keyof PluginHook; after: keyof PluginHook }>): MethodDecorator {
  return (target: any, propertyName: string, descriptor: TypedPropertyDescriptor<any>) => {
    const method = descriptor.value;

    descriptor.value = function(...args: any[]) {
      options.before && this.pluginManager[options.before](...args);
      const returnObj = method.apply(this, arguments);
      options.after && this.pluginManager[options.after](returnObj);
      return returnObj;
    };
  };
}
