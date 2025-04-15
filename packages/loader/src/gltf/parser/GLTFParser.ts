import { AssetPromise, EngineObject } from "@galacean/engine-core";
import type { GLTFExtensionOwnerSchema } from "../GLTFSchema";
import { GLTFExtensionMode, GLTFExtensionParser } from "../extensions/GLTFExtensionParser";
import { GLTFExtensionSchema } from "../extensions/GLTFExtensionSchema";
import { GLTFParserContext } from "./GLTFParserContext";

/**
 * Base class of glTF parser.
 */
export abstract class GLTFParser {
  private static readonly _extensionParsers: Record<string, GLTFExtensionParser[]> = {};

  /**
   * Execute all parses of extension to create resource.
   * @param extensions - Related extensions field
   * @param context - The parser context
   * @param ownerSchema - The extension owner schema
   * @param extra - Extra params
   * @returns
   */
  static executeExtensionsCreateAndParse(
    extensions: { [key: string]: any } = {},
    context: GLTFParserContext,
    ownerSchema: GLTFExtensionOwnerSchema,
    ...extra
  ): EngineObject | void | AssetPromise<EngineObject | Uint8Array | void> {
    let resource: EngineObject | AssetPromise<EngineObject> = null;

    const extensionArray = Object.keys(extensions);
    for (let i = extensionArray.length - 1; i >= 0; --i) {
      const extensionName = extensionArray[i];
      const extensionSchema = extensions[extensionName];

      resource = <EngineObject | AssetPromise<EngineObject>>(
        GLTFParser._createAndParse(extensionName, context, extensionSchema, ownerSchema, ...extra)
      );
      if (resource) {
        return resource;
      }
    }
  }

  /**
   * Execute all parses of extension to parse resource.
   * @param extensions - Related extensions field
   * @param context - The parser context
   * @param parseResource -  The parsed resource
   * @param ownerSchema - The extension owner schema
   * @param extra - Extra params
   */
  static executeExtensionsAdditiveAndParse(
    extensions: { [key: string]: any },
    context: GLTFParserContext,
    parseResource: EngineObject,
    ownerSchema: GLTFExtensionOwnerSchema,
    ...extra
  ): void {
    for (let extensionName in extensions) {
      const extensionSchema = extensions[extensionName];
      GLTFParser._additiveParse(extensionName, context, parseResource, extensionSchema, ownerSchema, ...extra);
    }
  }

  /**
   * Whether the plugin is registered.
   * @param extensionName - Extension name
   * @returns Boolean
   */
  static hasExtensionParser(extensionName: string): boolean {
    return !!GLTFParser._extensionParsers[extensionName]?.length;
  }

  /**
   * Get the last plugin by glTF extension mode.
   * @param extensionName - Extension name
   * @param mode - GLTF extension mode
   * @returns GLTF extension parser
   */
  static getExtensionParser(extensionName: string, mode: GLTFExtensionMode): GLTFExtensionParser | undefined {
    const parsers = GLTFParser._extensionParsers[extensionName];
    const length = parsers?.length;

    if (length) {
      // only use the last parser.
      for (let i = length - 1; i >= 0; --i) {
        const currentParser = parsers[i];
        if (currentParser._mode === mode) {
          return currentParser;
        }
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

  private static _createAndParse(
    extensionName: string,
    context: GLTFParserContext,
    extensionSchema: GLTFExtensionSchema,
    ownerSchema: GLTFExtensionOwnerSchema,
    ...extra
  ): EngineObject | Uint8Array | AssetPromise<EngineObject | Uint8Array> {
    const parser = GLTFParser.getExtensionParser(extensionName, GLTFExtensionMode.CreateAndParse);

    if (parser) {
      const chainPromise = parser.createAndParse(context, extensionSchema, ownerSchema, ...extra);
      context.chainPromises.push(chainPromise);
      return chainPromise;
    }
  }

  private static _additiveParse(
    extensionName: string,
    context: GLTFParserContext,
    parseResource: EngineObject,
    extensionSchema: GLTFExtensionSchema,
    ownerSchema: GLTFExtensionOwnerSchema,
    ...extra
  ): void {
    const parser = GLTFParser.getExtensionParser(extensionName, GLTFExtensionMode.AdditiveParse);

    if (parser) {
      const chainPromise = parser.additiveParse(context, parseResource, extensionSchema, ownerSchema, ...extra);
      context.chainPromises.push(chainPromise);
    }
  }

  abstract parse(context: GLTFParserContext, index?: number);
}

/**
 * Declare ExtensionParser's decorator.
 * @param extensionName - Extension name
 */
export function registerGLTFExtension(extensionName: string, mode: GLTFExtensionMode) {
  return (parser: new () => GLTFExtensionParser) => {
    const extensionParser = new parser();
    extensionParser._mode = mode;
    GLTFParser._addExtensionParser(extensionName, extensionParser);
  };
}
