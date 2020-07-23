import { PluginManager, PluginHook } from "./plugins/PluginManager";
import { Oasis } from "./Oasis";
import { defaultCameraPlugin } from "./plugins/DefaultCameraPlugin";
import { Plugin } from "./plugins/Plugin";
import { Options } from "./types";

const CURRENT_SCHEMA_VERSION = 2;

export class Parser {
  private pluginManager: PluginManager = new PluginManager();
  public parse(options: Options): Promise<Oasis> {
    if (options?.config?.version !== CURRENT_SCHEMA_VERSION) {
      console.warn(
        `schema-parser: schema version "${options?.config?.version}" is out of date, please re-pull the latest version (version ${CURRENT_SCHEMA_VERSION}) of the schema`
      );
    }
    return Oasis.create(options, this.pluginManager);
  }

  register(plugin: Plugin) {
    this.pluginManager.register(plugin);
  }

  resetPlugins() {
    this.pluginManager.reset();
  }

  private constructor() {}

  static create(): Parser {
    // todo delete
    const parser = new Parser();
    parser.register(defaultCameraPlugin);
    return parser;
  }
}

export const parser = Parser.create();
