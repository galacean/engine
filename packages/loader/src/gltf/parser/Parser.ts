import { AnimationClip, AssetPromise, EngineObject, Material, Mesh } from "@oasis-engine/core";
import { ExtensionParser } from "../extensions/ExtensionParser";
import { ExtensionSchema } from "../extensions/Schema";
import { ParserContext } from "./ParserContext";

export abstract class Parser {
  private static _extensionParsers: Record<string, ExtensionParser[]> = {};

  static parseEngineResource(
    extensionName: string,
    extensionSchema: ExtensionSchema,
    parseResource: EngineObject,
    context: ParserContext,
    ...extra
  ): void {
    const parsers = Parser._extensionParsers[extensionName];

    if (parsers?.length) {
      for (let i = 0; i < parsers.length; i++) {
        parsers[i].parseEngineResource(extensionSchema, parseResource, context, ...extra);
      }
    }
  }

  static createEngineResource<T extends EngineObject>(
    extensionName: string,
    extensionSchema: ExtensionSchema,
    context: ParserContext,
    ...extra
  ): T | Promise<T> {
    const parsers = Parser._extensionParsers[extensionName];

    if (parsers?.length) {
      return parsers[0].createEngineResource(extensionSchema, context, ...extra) as T;
    }
  }

  static hasExtensionParser(extensionName: string): boolean {
    const parsers = Parser._extensionParsers[extensionName];
    return !!parsers?.length;
  }

  static initialize(extensionName: string) {
    const parsers = Parser._extensionParsers[extensionName];

    if (parsers?.length) {
      for (let i = 0; i < parsers.length; i++) {
        parsers[i].initialize();
      }
    }
  }

  /**
   * @internal
   */
  static _addExtensionParser(extensionName: string, extensionParser: ExtensionParser) {
    if (!Parser._extensionParsers[extensionName]) {
      Parser._extensionParsers[extensionName] = [];
    }
    Parser._extensionParsers[extensionName].push(extensionParser);
  }

  abstract parse(context: ParserContext): AssetPromise<any> | void | Material | AnimationClip | Mesh;
}

/**
 * Declare ExtensionParser's decorator.
 * @param extensionName - Extension name
 */
export function registerExtension(extensionName: string) {
  return (parser: new () => ExtensionParser) => {
    const extensionParser = new parser();

    Parser._addExtensionParser(extensionName, extensionParser);
  };
}
