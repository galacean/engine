import { AssetPromise, EngineObject } from "@galacean/engine-core";
import { GLTFExtensionOwnerSchema } from "../GLTFSchema";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionSchema } from "./GLTFExtensionSchema";

/**
 * Base class of glTF extension parser.
 */
export abstract class GLTFExtensionParser {
  /**
   * @internal
   * The extension mode.
   */
  _mode: GLTFExtensionMode;

  /**
   * Create and parse the resource.
   * @remarks This method overrides the default resource creation.
   * @param context - The parser context
   * @param extensionSchema - The extension schema
   * @param extensionOwnerSchema - The extension owner schema
   * @returns The resource or promise
   */
  createAndParse(
    context: GLTFParserContext,
    extensionSchema: GLTFExtensionSchema,
    extensionOwnerSchema: GLTFExtensionOwnerSchema,
    ...extra
  ): EngineObject | AssetPromise<EngineObject | Uint8Array> {
    throw "Not implemented.";
  }

  /**
   * Additive parse to the resource.
   * @param context - The parser context
   * @param parseResource - The parsed resource
   * @param extensionSchema - The extension schema
   * @param extensionOwnerSchema - The extension owner schema
   * @returns The void or promise
   */
  additiveParse(
    context: GLTFParserContext,
    parseResource: EngineObject,
    extensionSchema: GLTFExtensionSchema,
    extensionOwnerSchema: GLTFExtensionOwnerSchema,
    ...extra
  ): void | AssetPromise<void> {
    throw "Not implemented.";
  }
}

/**
 * glTF Extension mode.
 */
export enum GLTFExtensionMode {
  /**
   * Cerate instance and parse mode.
   * @remarks
   * If the glTF property has multiple extensions of `CreateAndParse` mode, only execute the last one.
   * If this method is registered, the default pipeline processing will be ignored.
   */
  CreateAndParse,

  /** Additive parse mode. */
  AdditiveParse
}
