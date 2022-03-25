import { PBRBaseMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsVolume } from "./Schema";

@registerExtension("KHR_materials_volume")
class KHR_materials_volume extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsVolume, material: PBRBaseMaterial, context: GLTFResource): void {
    const { textures } = context;
    const { thicknessFactor = 0, thicknessTexture, attenuationColor, attenuationDistance } = schema;

    material.thickness = thicknessFactor;

    if (thicknessTexture) {
      material.thicknessTexture = textures[thicknessTexture.index];
      MaterialParser._parseTextureTransform(material, thicknessTexture.extensions, context);
    }

    if (attenuationColor) {
      material.attenuationColor = new Color(
        Color.linearToGammaSpace(attenuationColor[0]),
        Color.linearToGammaSpace(attenuationColor[1]),
        Color.linearToGammaSpace(attenuationColor[2])
      );
    }

    if (attenuationDistance) {
      material.attenuationDistance = attenuationDistance;
    }
  }
}
