import { Logger, PBRMaterial, Texture2D } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsSpecular } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_Specular", GLTFExtensionMode.CreateAndParse)
class KHR_materials_specular extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsSpecular): void {
    const { specularFactor, specularTexture, specularColorFactor, specularColorTexture } = schema;

    material.specular = specularFactor;

    if (specularColorFactor) {
      material.specularColor.set(specularColorFactor[0], specularColorFactor[1], specularColorFactor[2], undefined);
    }

    if (specularTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(specularTexture, "Specular texture");

      context
        .get<Texture2D>(GLTFParserType.Texture, specularTexture.index)
        .then((texture) => {
          material.specularTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_specular: specularTexture error", e);
        });
    }

    if (specularColorTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(specularColorTexture, "SpecularColor texture");

      context
        .get<Texture2D>(GLTFParserType.Texture, specularColorTexture.index)
        .then((texture) => {
          material.specularColorTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_specular: SpecularColorTexture error", e);
        });
    }
  }
}
