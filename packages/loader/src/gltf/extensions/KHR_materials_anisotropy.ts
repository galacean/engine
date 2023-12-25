import { PBRMaterial, Texture2D } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsAnisotropy } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_anisotropy", GLTFExtensionMode.AdditiveParse)
class KHR_materials_anisotropy extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsAnisotropy): void {
    const { anisotropyStrength = 0, anisotropyRotation = 0, anisotropyTexture } = schema;

    material.anisotropy = anisotropyStrength;
    material.anisotropyDirection.set(Math.cos(anisotropyRotation), Math.sin(anisotropyRotation));

    if (anisotropyTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(anisotropyTexture, "Anisotropy texture");

      context.get<Texture2D>(GLTFParserType.Texture, anisotropyTexture.index).then((texture) => {
        material.anisotropyTexture = texture;
      });
    }
  }
}
