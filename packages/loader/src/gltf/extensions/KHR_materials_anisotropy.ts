import { PBRMaterial } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsAnisotropy } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_anisotropy", GLTFExtensionMode.AdditiveParse)
class KHR_materials_anisotropy extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsAnisotropy): void {
    const { anisotropyStrength = 0, anisotropyRotation = 0, anisotropyTexture } = schema;

    material.anisotropy = anisotropyStrength;
    material.anisotropyRotation = anisotropyRotation;

    if (anisotropyTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(anisotropyTexture, "Anisotropy texture");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        anisotropyTexture.index,
        (texture) => {
          material.anisotropyTexture = texture;
        },
        "KHR_materials_anisotropy: anisotropy texture error"
      );
    }
  }
}
