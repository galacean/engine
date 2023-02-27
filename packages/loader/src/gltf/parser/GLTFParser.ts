import { AnimationClip, AssetPromise, EngineObject, Logger, Material, Mesh } from "@oasis-engine/core";
import { GLTFExtensionParser } from "../extensions/GLTFExtensionParser";
import { GLTFExtensionSchema } from "../extensions/GLTFExtensionSchema";
import { ExtensibleResource } from "../GLTFSchema";
import { GLTFParserContext } from "./GLTFParserContext";

export abstract class GLTFParser {
  private static _extensionParsers: Record<string, GLTFExtensionParser<ExtensibleResource>[]> = {};

  static parseEngineResource(
    extensionName: string,
    context: GLTFParserContext,
    parseResource: EngineObject,
    extensionSchema: GLTFExtensionSchema,
    resourceInfo: ExtensibleResource
  ): void {
    const parsers = GLTFParser._extensionParsers[extensionName];
    const length = parsers?.length;

    if (length) {
      if (length > 1) {
        Logger.warn(`plugin:${extensionName} has been overridden`);
      }
      parsers[length - 1].parseEngineResource(context, parseResource, extensionSchema, resourceInfo);
    }
  }

  static createEngineResource(
    extensionName: string,
    context: GLTFParserContext,
    extensionSchema: GLTFExtensionSchema,
    resourceInfo: ExtensibleResource
  ): EngineObject | Promise<EngineObject> {
    const parsers = GLTFParser._extensionParsers[extensionName];
    const length = parsers?.length;

    if (length) {
      if (length > 1) {
        Logger.warn(`plugin:${extensionName} has been overridden`);
      }
      return parsers[length - 1].createEngineResource(context, extensionSchema, resourceInfo);
    }
  }

  static hasExtensionParser(extensionName: string): boolean {
    const parsers = GLTFParser._extensionParsers[extensionName];
    return !!parsers?.length;
  }

  static initialize(extensionName: string) {
    const parsers = GLTFParser._extensionParsers[extensionName];

    if (parsers?.length) {
      for (let i = 0; i < parsers.length; i++) {
        parsers[i].initialize();
      }
    }
  }

  /**
   * @internal
   */
  static _addExtensionParser(extensionName: string, extensionParser: GLTFExtensionParser<ExtensibleResource>) {
    if (!GLTFParser._extensionParsers[extensionName]) {
      GLTFParser._extensionParsers[extensionName] = [];
    }
    GLTFParser._extensionParsers[extensionName].push(extensionParser);
  }

  abstract parse(context: GLTFParserContext): AssetPromise<any> | void | Material | AnimationClip | Mesh;
}

/**
 * Declare ExtensionParser's decorator.
 * @param extensionName - Extension name
 */
export function registerGLTFExtension(extensionName: string) {
  return (parser: new () => GLTFExtensionParser<ExtensibleResource>) => {
    const extensionParser = new parser();

    GLTFParser._addExtensionParser(extensionName, extensionParser);
  };
}
