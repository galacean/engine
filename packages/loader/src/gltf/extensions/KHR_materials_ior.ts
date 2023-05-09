import { PBRMaterial } from "@galacean/engine-core";
import { IKHRMaterialsIor } from "./GLTFExtensionSchema";
import { GLTFParserContext } from "../parser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";

@registerGLTFExtension("KHR_materials_ior", GLTFExtensionMode.AdditiveParse)
class KHR_materials_ior extends GLTFExtensionParser {
  parseEngineResource(schema: IKHRMaterialsIor, material: PBRMaterial, context: GLTFParserContext): void {
    const { ior = 1.5 } = schema;

    material.ior = ior;
  }
}
