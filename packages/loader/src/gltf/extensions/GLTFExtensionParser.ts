import { EngineObject } from "@oasis-engine/core";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionSchema } from "./GLTFExtensionSchema";

export abstract class GLTFExtensionParser {
  initialize(): void {}

  parseEngineResource(
    schema: GLTFExtensionSchema,
    parseResource: EngineObject,
    context: GLTFParserContext,
    ...extra
  ): void | Promise<void> {}

  createEngineResource(
    schema: GLTFExtensionSchema,
    context: GLTFParserContext,
    ...extra
  ): EngineObject | Promise<EngineObject> {
    return null;
  }
}
