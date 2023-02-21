import { EngineObject } from "@oasis-engine/core";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionSchema } from "./Schema";

export abstract class ExtensionParser {
  initialize(): void {}

  parseEngineResource(
    schema: ExtensionSchema,
    parseResource: EngineObject,
    context: ParserContext,
    ...extra
  ): void | Promise<void> {}

  createEngineResource(
    schema: ExtensionSchema,
    context: ParserContext,
    ...extra
  ): EngineObject | Promise<EngineObject> {
    return null;
  }
}
