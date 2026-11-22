import { PBRMaterial } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsVolume } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_volume", GLTFExtensionMode.AdditiveParse)
class KHR_materials_volume extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsVolume): void {
    const { thicknessFactor = 0, thicknessTexture, attenuationDistance = Infinity, attenuationColor } = schema;
    material.thickness = thicknessFactor;
    material.attenuationDistance = attenuationDistance;

    if (attenuationColor) {
      material.attenuationColor.set(
        attenuationColor[0],
        attenuationColor[1],
        attenuationColor[2],
        material.attenuationColor.a
      );
    }

    if (thicknessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(thicknessTexture, "Thickness texture");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        thicknessTexture.index,
        (texture) => {
          material.thicknessTexture = texture;
        },
        "KHR_materials_volume: thickness texture error"
      );
    }
  }
}
