import { Logger, PBRMaterial, Texture2D } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsSheen } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_sheen", GLTFExtensionMode.AdditiveParse)
class KHR_materials_sheen extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsSheen): void {
    const { sheenColorFactor, sheenColorTexture, sheenRoughnessFactor = 0, sheenRoughnessTexture } = schema;

    if (sheenColorFactor) {
      material.sheenColor.set(sheenColorFactor[0], sheenColorFactor[1], sheenColorFactor[2], undefined);
    }

    material.sheenRoughness = sheenRoughnessFactor;

    if (sheenColorTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(sheenColorTexture, "Sheen texture");

      context
        .get<Texture2D>(GLTFParserType.Texture, sheenColorTexture.index)
        .then((texture) => {
          material.sheenColorTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_sheen: sheenColorTexture error", e);
        });
    }

    if (sheenRoughnessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(sheenRoughnessTexture, "SheenRoughness texture");

      context
        .get<Texture2D>(GLTFParserType.Texture, sheenRoughnessTexture.index)
        .then((texture) => {
          material.sheenRoughnessTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_sheen: sheenRoughnessTexture error", e);
        });
    }
  }
}
