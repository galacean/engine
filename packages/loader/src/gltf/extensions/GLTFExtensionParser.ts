import { EngineObject } from "@oasis-engine/core";
import { ExtensibleResource } from "../GLTFSchema";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionSchema } from "./GLTFExtensionSchema";

export abstract class GLTFExtensionParser<T extends ExtensibleResource> {
  initialize(): void {}

  parseEngineResource(
    context: GLTFParserContext,
    parseResource: EngineObject,
    extensionSchema: GLTFExtensionSchema,
    resourceInfo: T
  ): void | Promise<void> {}

  createEngineResource(
    context: GLTFParserContext,
    extensionSchema: GLTFExtensionSchema,
    resourceInfo: T
  ): EngineObject | Promise<EngineObject> {
    return null;
  }
}
