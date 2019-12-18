import * as o3 from "@alipay/o3";
import { Oasis } from "../Oasis";

export class PluginManager implements PluginHook {
  private registeredPlugins: Set<ClassType<PluginHook>> = new Set();
  private plugins: PluginHook[] = [];

  register<T extends PluginHook>(pluginClass: ClassType<T>) {
    this.registeredPlugins.add(pluginClass);
  }

  boot(oasis: Oasis) {
    for (let PluginClass of this.registeredPlugins.values()) {
      const plugin = new PluginClass();
      plugin.oasis = oasis;
      this.plugins.push(plugin);
    }
  }

  reset() {
    this.registeredPlugins.clear();
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
    this.plugins.forEach(plugin => plugin[name] && (plugin[name] as any)(param));
  }
}

export interface PluginHook {
  oasis?: Oasis;
  nodeAdded?(node: o3.Node): any;
  abilityAdded?(ability: o3.NodeAbility): any;
  // todo type
  resourceAdded?(resource: any): any;
}

export function pluginHook(options: Partial<{ before: keyof PluginHook; after: keyof PluginHook }>): MethodDecorator {
  return function(target: any, propertyName: string, descriptor: TypedPropertyDescriptor<any>) {
    const method = descriptor.value;

    descriptor.value = function(...args: any[]) {
      options.before && this.oasis.pluginManager[options.before](...args);
      const returnObj = method.apply(this, arguments);
      options.after && this.oasis.pluginManager[options.after](returnObj);
      return returnObj;
    };
  };
}
