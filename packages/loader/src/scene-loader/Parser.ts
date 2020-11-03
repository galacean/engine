import { Component } from "@oasis-engine/core";
import { Oasis } from "./Oasis";
import { Plugin } from "./plugins/Plugin";
import { PluginManager } from "./plugins/PluginManager";
import { Options } from "./types";
import { compatibleToV2 } from "./temp.compatible";

const CURRENT_SCHEMA_VERSION = 3;

export class Parser {
  private pluginManager: PluginManager = new PluginManager();
  public parse(options: Options): Promise<Oasis> {
    if (options?.config?.version !== CURRENT_SCHEMA_VERSION) {
      console.warn(
        `schema-parser: schema version "${options?.config?.version}" is out of date, please re-pull the latest version (version ${CURRENT_SCHEMA_VERSION}) of the schema`
      );
    }
    compatibleToV2(options.config);
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
    const parser = new Parser();
    return parser;
  }

  /** @internal */
  public static _components: { [namespace: string]: { [compName: string]: Component } } = {};
  /**
   * 注册解析组件
   * @param namespace 命名空间
   * @param components 组件
   */
  static registerComponents(namespace: string, components: { [key: string]: any }) {
    if (!this._components[namespace]) {
      this._components[namespace] = {};
    }
    Object.assign(this._components[namespace], components);
  }
}

export const parser = Parser.create();
