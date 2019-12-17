import { PluginManager } from "./plugins/PluginManager";
import { Oasis } from "./Oasis";

export class Parser {
  private pluginManager: PluginManager = new PluginManager();
  public async parse(options: Options) {
    return await Oasis.create(options, this.pluginManager);
  }
}

export const parser = new Parser();
