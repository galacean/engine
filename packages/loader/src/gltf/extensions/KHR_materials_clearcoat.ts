import { PBRMaterial } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsClearcoat } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_clearcoat", GLTFExtensionMode.AdditiveParse)
class KHR_materials_clearcoat extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsClearcoat): void {
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
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatTexture, "Clear coat");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        clearcoatTexture.index,
        (texture) => {
          material.clearCoatTexture = texture;
        },
        "KHR_materials_clearcoat: clearcoat texture error"
      );
    }
    if (clearcoatRoughnessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatRoughnessTexture, "Clear coat roughness");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        clearcoatRoughnessTexture.index,
        (texture) => {
          material.clearCoatRoughnessTexture = texture;
        },
        "KHR_materials_clearcoat: clearcoat roughness texture error"
      );
    }
    if (clearcoatNormalTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatNormalTexture, "Clear coat normal");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        clearcoatNormalTexture.index,
        (texture) => {
          material.clearCoatNormalTexture = texture;
        },
        "KHR_materials_clearcoat: clearcoat normal texture error"
      );
    }
  }
}
