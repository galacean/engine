import { PBRBaseMaterial } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsIor } from "./Schema";

@registerExtension("KHR_materials_ior")
class KHR_materials_ior extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsIor, material: PBRBaseMaterial, context: GLTFResource): void {
    const { ior = 1.5 } = schema;

    material.ior = ior;
  }
}
