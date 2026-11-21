import { Material, PBRMaterial } from "@galacean/engine-core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsEmissiveStrength } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_emissive_strength", GLTFExtensionMode.AdditiveParse)
class KHR_materials_emissive_strength extends GLTFExtensionParser {
  override additiveParse(_: GLTFParserContext, material: Material, schema: IKHRMaterialsEmissiveStrength): void {
    const { emissiveStrength = 1 } = schema;
    if (emissiveStrength !== 1 && material instanceof PBRMaterial) {
      const color = material.emissiveColor;
      color.set(color.r * emissiveStrength, color.g * emissiveStrength, color.b * emissiveStrength, color.a);
    }
  }
}
