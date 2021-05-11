import { EngineObject } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { ExtensionSchema } from "./Schema";

export abstract class ExtensionParser {
  bootstrap(): void {}

  parseEngineResource(
    schema: ExtensionSchema,
    parseResource: EngineObject,
    context: GLTFResource,
    ...extra
  ): void | Promise<void> {}

  createEngineResource(schema: ExtensionSchema, context: GLTFResource, ...extra): EngineObject | Promise<EngineObject> {
    return null;
  }
}
