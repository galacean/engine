import { PBRMaterial } from "@galacean/engine-core";
import { IKHRMaterialsIor } from "./Schema";

import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";

@registerExtension("KHR_materials_ior")
class KHR_materials_ior extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsIor, material: PBRMaterial, context: ParserContext): void {
    const { ior = 1.5 } = schema;

    material.ior = ior;
  }
}
