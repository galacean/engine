import { PBRMaterial } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsSheen } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_sheen", GLTFExtensionMode.AdditiveParse)
class KHR_materials_sheen extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsSheen): void {
    const { sheenColorFactor, sheenColorTexture, sheenRoughnessFactor = 0, sheenRoughnessTexture } = schema;

    if (sheenColorFactor) {
      material.sheenColor.set(sheenColorFactor[0], sheenColorFactor[1], sheenColorFactor[2], material.sheenColor.a);
    }

    material.sheenRoughness = sheenRoughnessFactor;

    if (sheenColorTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(sheenColorTexture, "Sheen texture");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        sheenColorTexture.index,
        (texture) => {
          material.sheenColorTexture = texture;
        },
        "KHR_materials_sheen: sheenColorTexture error"
      );
    }

    if (sheenRoughnessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(sheenRoughnessTexture, "SheenRoughness texture");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        sheenRoughnessTexture.index,
        (texture) => {
          material.sheenRoughnessTexture = texture;
        },
        "KHR_materials_sheen: sheenRoughnessTexture error"
      );
    }
  }
}
