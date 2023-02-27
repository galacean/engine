import { EngineObject } from "@oasis-engine/core";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { ExtensionSchema } from "./GLTFExtensionSchema";

export abstract class GLTFExtensionParser {
  initialize(): void {}

  parseEngineResource(
    schema: ExtensionSchema,
    parseResource: EngineObject,
    context: GLTFParserContext,
    ...extra
  ): void | Promise<void> {}

  createEngineResource(
    schema: ExtensionSchema,
    context: GLTFParserContext,
    ...extra
  ): EngineObject | Promise<EngineObject> {
    return null;
  }
}
