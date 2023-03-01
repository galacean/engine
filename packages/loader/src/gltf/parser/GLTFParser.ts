import { AnimationClip, AssetPromise, EngineObject, Material, Mesh } from "@oasis-engine/core";
import { GLTFExtensionMode, GLTFExtensionParser } from "../extensions/GLTFExtensionParser";
import { GLTFExtensionSchema } from "../extensions/GLTFExtensionSchema";
import { GLTFExtensionOwnerSchema } from "../GLTFSchema";
import { GLTFParserContext } from "./GLTFParserContext";

export abstract class GLTFParser {
  private static readonly _extensionParsers: Record<string, GLTFExtensionParser[]> = {};

  static initialize(extensionName: string): void | Promise<void> {
    const parsers = GLTFParser._extensionParsers[extensionName];
    const length = parsers?.length;

    if (length) {
      return parsers[length - 1].initialize();
    }
  }

  static createAndParse(
    extensionName: string,
    context: GLTFParserContext,
    extensionSchema: GLTFExtensionSchema,
    ownerSchema: GLTFExtensionOwnerSchema
  ): EngineObject | Promise<EngineObject> {
    const parser = GLTFParser.getExtensionParser(extensionName, GLTFExtensionMode.CreateAndParse);

    if (parser) {
      return parser.createAndParse(context, extensionSchema, ownerSchema);
    }
  }

  static additiveParse(
    extensionName: string,
    context: GLTFParserContext,
    parseResource: EngineObject,
    extensionSchema: GLTFExtensionSchema,
    ownerSchema: GLTFExtensionOwnerSchema
  ): void {
    const parser = GLTFParser.getExtensionParser(extensionName, GLTFExtensionMode.AdditiveParse);

    if (parser) {
      parser.additiveParse(context, parseResource, extensionSchema, ownerSchema);
    }
  }

  static createAndParseFromExtensions(
    extensions: { [key: string]: any } = {},
    context: GLTFParserContext,
    ownerSchema: GLTFExtensionOwnerSchema
  ): EngineObject | void | Promise<EngineObject | void> {
    let resource: EngineObject | Promise<EngineObject> = null;

    const extensionArray = Object.keys(extensions);
    for (let i = extensionArray.length - 1; i >= 0; --i) {
      const extensionName = extensionArray[i];
      const extensionSchema = extensions[extensionName];

      resource = <EngineObject | Promise<EngineObject>>(
        GLTFParser.createAndParse(extensionName, context, extensionSchema, ownerSchema)
      );
      if (resource) {
        return resource;
      }
    }
  }

  static additiveParseFromExtensions(
    extensions: { [key: string]: any },
    context: GLTFParserContext,
    parseResource: EngineObject,
    ownerSchema: GLTFExtensionOwnerSchema
  ): void {
    for (let extensionName in extensions) {
      const extensionSchema = extensions[extensionName];
      GLTFParser.additiveParse(extensionName, context, parseResource, extensionSchema, ownerSchema);
    }
  }

  static hasExtensionParser(extensionName: string): boolean {
    return !!GLTFParser._extensionParsers[extensionName]?.length;
  }

  static getExtensionParser(extensionName: string, mode: GLTFExtensionMode): GLTFExtensionParser | void {
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

  abstract parse(context: GLTFParserContext): AssetPromise<any> | void | Material | AnimationClip | Mesh;
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
