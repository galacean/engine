import { PBRMaterial } from "@oasis-engine/core";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsClearcoat } from "./Schema";

@registerExtension("KHR_materials_clearcoat")
class KHR_materials_clearcoat extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsClearcoat, material: PBRMaterial, context: ParserContext): void {
    const { textures } = context.glTFResource;
    const {
      clearcoatFactor = 0,
      clearcoatTexture,
      clearcoatRoughnessFactor = 0,
      clearcoatRoughnessTexture,
      clearcoatNormalTexture
    } = schema;

    material.clearCoat = clearcoatFactor;
    material.clearCoatRoughness = clearcoatRoughnessFactor;

    if (clearcoatTexture) {
      material.clearCoatTexture = textures[clearcoatTexture.index];
      MaterialParser._checkOtherTextureTransform(clearcoatTexture, "Clear coat");
    }
    if (clearcoatRoughnessTexture) {
      material.clearCoatRoughnessTexture = textures[clearcoatRoughnessTexture.index];
      MaterialParser._checkOtherTextureTransform(clearcoatRoughnessTexture, "Clear coat roughness");
    }
    if (clearcoatNormalTexture) {
      material.clearCoatNormalTexture = textures[clearcoatNormalTexture.index];
      MaterialParser._checkOtherTextureTransform(clearcoatNormalTexture, "Clear coat normal");
    }
  }
}
