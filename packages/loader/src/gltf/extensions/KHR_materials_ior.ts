import { PBRMaterial } from "@galacean/engine-core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsIor } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_ior", GLTFExtensionMode.AdditiveParse)
class KHR_materials_ior extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsIor): void {
    const { ior = 1.5 } = schema;

    material.ior = ior;
  }
}
