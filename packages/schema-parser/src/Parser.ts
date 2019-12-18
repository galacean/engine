import { PluginManager, PluginHook } from "./plugins/PluginManager";
import { Oasis } from "./Oasis";
import { DefaultCameraPlugin } from "./plugins/DefaultCameraPlugin";

export class Parser {
  private pluginManager: PluginManager = new PluginManager();
  public parse(options: Options): Promise<Oasis> {
    return Oasis.create(options, this.pluginManager);
  }

  register<T extends PluginHook>(pluginClass: ClassType<T>) {
    this.pluginManager.register(pluginClass);
  }

  resetPlugins() {
    this.pluginManager.reset();
  }
}

export const parser = new Parser();
parser.register(DefaultCameraPlugin);
