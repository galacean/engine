import { PBRMaterial } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsSpecular } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_specular", GLTFExtensionMode.AdditiveParse)
class KHR_materials_specular extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsSpecular): void {
    const { specularFactor = 1, specularTexture, specularColorFactor, specularColorTexture } = schema;

    material.specularIntensity = specularFactor;

    if (specularColorFactor) {
      material.specularColor.set(
        specularColorFactor[0],
        specularColorFactor[1],
        specularColorFactor[2],
        material.specularColor.a
      );
    }

    if (specularTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(specularTexture, "Specular intensity texture");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        specularTexture.index,
        (texture) => {
          material.specularIntensityTexture = texture;
        },
        "KHR_materials_specular: specularTexture error"
      );
    }

    if (specularColorTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(specularColorTexture, "Specular color texture");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        specularColorTexture.index,
        (texture) => {
          material.specularColorTexture = texture;
        },
        "KHR_materials_specular: SpecularColorTexture error"
      );
    }
  }
}
