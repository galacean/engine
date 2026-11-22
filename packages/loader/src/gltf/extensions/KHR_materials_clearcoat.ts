import { Logger, PBRMaterial, Texture2D } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
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

      context
        .get<Texture2D>(GLTFParserType.Texture, clearcoatTexture.index)
        .then((texture) => {
          material.clearCoatTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_clearcoat: clearcoat texture error", e);
        });
    }
    if (clearcoatRoughnessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatRoughnessTexture, "Clear coat roughness");

      context
        .get<Texture2D>(GLTFParserType.Texture, clearcoatRoughnessTexture.index)
        .then((texture) => {
          material.clearCoatRoughnessTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_clearcoat: clearcoat roughness texture error", e);
        });
    }
    if (clearcoatNormalTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(clearcoatNormalTexture, "Clear coat normal");

      context
        .get<Texture2D>(GLTFParserType.Texture, clearcoatNormalTexture.index)
        .then((texture) => {
          material.clearCoatNormalTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_clearcoat: clearcoat normal texture error", e);
        });
    }
  }
}
