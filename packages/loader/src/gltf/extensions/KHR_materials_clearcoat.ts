import { PBRMaterial } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsClearcoat } from "./Schema";

@registerExtension("KHR_materials_clearcoat")
class KHR_materials_clearcoat extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsClearcoat, material: PBRMaterial, context: GLTFResource): void {
    const { textures } = context;
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
      MaterialParser._parseTextureTransform(material, clearcoatTexture.extensions, context);
    }
    if (clearcoatRoughnessTexture) {
      material.clearCoatRoughnessTexture = textures[clearcoatRoughnessTexture.index];
      MaterialParser._parseTextureTransform(material, clearcoatRoughnessTexture.extensions, context);
    }
    if (clearcoatNormalTexture) {
      material.clearCoatNormalTexture = textures[clearcoatNormalTexture.index];
      MaterialParser._parseTextureTransform(material, clearcoatNormalTexture.extensions, context);
    }
  }
}
