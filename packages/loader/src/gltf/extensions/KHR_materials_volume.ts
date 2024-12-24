import { PBRMaterial, Texture2D, RefractionMode } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsVolume } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_volume", GLTFExtensionMode.AdditiveParse)
class KHR_materials_volume extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsVolume): void {
    const { thicknessFactor = 0, thicknessTexture, attenuationDistance = Infinity, attenuationColor } = schema;
    material.refractionMode = RefractionMode.Plane;

    material.thickness = thicknessFactor;
    material.attenuationDistance = attenuationDistance;

    if (attenuationColor) {
      material.attenuationColor.set(
        Color.linearToGammaSpace(attenuationColor[0]),
        Color.linearToGammaSpace(attenuationColor[1]),
        Color.linearToGammaSpace(attenuationColor[2]),
        undefined
      );
    }

    if (thicknessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(thicknessTexture, "Thickness texture");

      context.get<Texture2D>(GLTFParserType.Texture, thicknessTexture.index).then((texture) => {
        material.thicknessTexture = texture;
      });
    }
  }
}
