import { AnimationClip, AssetPromise, EngineObject, Logger, Material, Mesh } from "@oasis-engine/core";
import { GLTFExtensionParser } from "../extensions/GLTFExtensionParser";
import { GLTFExtensionSchema } from "../extensions/GLTFExtensionSchema";
import { GLTFParserContext } from "./GLTFParserContext";

export abstract class GLTFParser {
  private static _extensionParsers: Record<string, GLTFExtensionParser[]> = {};

  static parseEngineResource(
    extensionName: string,
    extensionSchema: GLTFExtensionSchema,
    parseResource: EngineObject,
    context: GLTFParserContext,
    resourceIndex: number,
    ...extra
  ): void {
    const parsers = GLTFParser._extensionParsers[extensionName];
    const length = parsers?.length;

    if (length) {
      if (length > 1) {
        Logger.warn(`plugin:${extensionName} has been overridden`);
      }
      parsers[length - 1].parseEngineResource(extensionSchema, parseResource, context, resourceIndex, ...extra);
    }
  }

  static createEngineResource(
    extensionName: string,
    extensionSchema: GLTFExtensionSchema,
    context: GLTFParserContext,
    resourceIndex: number,
    ...extra
  ): EngineObject | Promise<EngineObject> {
    const parsers = GLTFParser._extensionParsers[extensionName];
    const length = parsers?.length;

    if (length) {
      if (length > 1) {
        Logger.warn(`plugin:${extensionName} has been overridden`);
      }
      return parsers[length - 1].createEngineResource(extensionSchema, context, resourceIndex, ...extra);
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
  static _addExtensionParser(extensionName: string, extensionParser: GLTFExtensionParser) {
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
  return (parser: new () => GLTFExtensionParser) => {
    const extensionParser = new parser();

    GLTFParser._addExtensionParser(extensionName, extensionParser);
  };
}
