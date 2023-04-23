import { PBRMaterial } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsClearcoat } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_clearcoat", GLTFExtensionMode.AdditiveParse)
class KHR_materials_clearcoat extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsClearcoat): void {
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
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatTexture, "Clear coat");
    }
    if (clearcoatRoughnessTexture) {
      material.clearCoatRoughnessTexture = textures[clearcoatRoughnessTexture.index];
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatRoughnessTexture, "Clear coat roughness");
    }
    if (clearcoatNormalTexture) {
      material.clearCoatNormalTexture = textures[clearcoatNormalTexture.index];
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatNormalTexture, "Clear coat normal");
    }
  }
}
