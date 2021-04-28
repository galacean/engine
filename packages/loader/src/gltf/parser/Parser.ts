import { RefObject } from "@oasis-engine/core";
import { ExtensionParser } from "../extensions/ExtensionParser";
import { ExtensionSchema } from "../extensions/schema";
import { GLTFResource } from "../GLTFResource";

export abstract class Parser {
  /** @internal */
  static _addExtensionParser(extensionName: string, extensionParser: ExtensionParser) {
    if (!Parser._extensionParsers[extensionName]) {
      Parser._extensionParsers[extensionName] = [];
    }
    Parser._extensionParsers[extensionName].push(extensionParser);
  }

  private static _extensionParsers: Record<string, ExtensionParser[]> = {};

  static parseEngineResource(
    extensionName: string,
    extensionSchema: ExtensionSchema,
    parseResource: RefObject,
    context: GLTFResource,
    ...extra
  ): void {
    const parsers = Parser._extensionParsers[extensionName];

    if (parsers?.length) {
      for (let i = 0; i < parsers.length; i++) {
        parsers[i].parseEngineResource(extensionSchema, parseResource, context, ...extra);
      }
    }
  }

  static createEngineResource<T extends RefObject>(
    extensionName: string,
    extensionSchema: ExtensionSchema,
    context: GLTFResource,
    ...extra
  ): T {
    const parsers = Parser._extensionParsers[extensionName];

    if (parsers?.length) {
      return parsers[0].createEngineResource(extensionSchema, context, ...extra) as T;
    }
  }

  static parseEngineResourceAsync(
    extensionName: string,
    extensionSchema: ExtensionSchema,
    parseResource: RefObject,
    context: GLTFResource,
    ...extra
  ): Promise<void> {
    const parsers = Parser._extensionParsers[extensionName];
    const promises: (void | Promise<void>)[] = [];

    if (parsers?.length) {
      for (let i = 0; i < parsers.length; i++) {
        promises.push(parsers[i].parseEngineResource(extensionSchema, parseResource, context, ...extra));
      }
    }

    return Promise.all(promises).then();
  }

  static createEngineResourceAsync<T extends RefObject>(
    extensionName: string,
    extensionSchema: ExtensionSchema,
    context: GLTFResource,
    ...extra
  ): Promise<T> {
    const parsers = Parser._extensionParsers[extensionName];

    if (parsers?.length) {
      return Promise.resolve(parsers[0].createEngineResource(extensionSchema, context, ...extra) as T);
    }
  }

  static hasExtensionParser(extensionName: string): boolean {
    const parsers = Parser._extensionParsers[extensionName];
    return !!parsers?.length;
  }

  static bootstarp(extensionName: string) {
    const parsers = Parser._extensionParsers[extensionName];

    if (parsers?.length) {
      for (let i = 0; i < parsers.length; i++) {
        parsers[i].bootstrap();
      }
    }
  }

  abstract parse(context: GLTFResource): void | Promise<void>;
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
