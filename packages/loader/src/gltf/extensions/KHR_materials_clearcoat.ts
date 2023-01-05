import { Logger, PBRMaterial } from "@oasis-engine/core";
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
      if (clearcoatTexture.extensions?.KHR_texture_transform) {
        Logger.warn("Clearcoat texture always use the KHR_texture_transform of the base texture.");
      }
    }
    if (clearcoatRoughnessTexture) {
      material.clearCoatRoughnessTexture = textures[clearcoatRoughnessTexture.index];
      if (clearcoatRoughnessTexture.extensions?.KHR_texture_transform) {
        Logger.warn("Clearcoat roughness texture always use the KHR_texture_transform of the base texture.");
      }
    }
    if (clearcoatNormalTexture) {
      material.clearCoatNormalTexture = textures[clearcoatNormalTexture.index];
      if (clearcoatNormalTexture.extensions?.KHR_texture_transform) {
        Logger.warn("Clearcoat normal texture always use the KHR_texture_transform of the base texture.");
      }
    }
  }
}
