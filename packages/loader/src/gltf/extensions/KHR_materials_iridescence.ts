import { Logger, PBRMaterial, Texture2D } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsIridescence } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_iridescence", GLTFExtensionMode.AdditiveParse)
class KHR_materials_iridescence extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsIridescence): void {
    const {
      iridescenceFactor = 0,
      iridescenceTexture,
      iridescenceIor = 1.3,
      iridescenceThicknessMinimum = 100,
      iridescenceThicknessMaximum = 400,
      iridescenceThicknessTexture
    } = schema;

    material.iridescence = iridescenceFactor;
    material.iridescenceIOR = iridescenceIor;
    material.iridescenceThicknessRange.set(iridescenceThicknessMinimum, iridescenceThicknessMaximum);

    if (iridescenceTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(iridescenceTexture, "Iridescence texture");

      context
        .get<Texture2D>(GLTFParserType.Texture, iridescenceTexture.index)
        .then((texture) => {
          material.iridescenceTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_iridescence: iridescence texture error", e);
        });
    }
    if (iridescenceThicknessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(iridescenceThicknessTexture, "IridescenceThickness texture");

      context
        .get<Texture2D>(GLTFParserType.Texture, iridescenceThicknessTexture.index)
        .then((texture) => {
          material.iridescenceThicknessTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_iridescence: iridescence thickness error", e);
        });
    }
  }
}
