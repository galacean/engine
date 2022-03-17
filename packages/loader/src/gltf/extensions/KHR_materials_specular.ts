import { PBRMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsSpecular } from "./Schema";

@registerExtension("KHR_materials_specular")
class KHR_materials_specular extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsSpecular, material: PBRMaterial, context: GLTFResource): void {
    const { textures } = context;
    const { specularFactor = 1, specularTexture, specularColorFactor, specularColorTexture } = schema;

    material.dielectricSpecularIntensity = specularFactor;

    if (specularColorFactor) {
      material.dielectricF0Color = new Color(
        Color.linearToGammaSpace(specularColorFactor[0]),
        Color.linearToGammaSpace(specularColorFactor[1]),
        Color.linearToGammaSpace(specularColorFactor[2])
      );
    }

    if (specularTexture) {
      material.dielectricSpecularIntensityTexture = textures[specularTexture.index];
      MaterialParser._parseTextureTransform(material, specularTexture.extensions, context);
    }

    if (specularColorTexture) {
      material.dielectricF0ColorTexture = textures[specularColorTexture.index];
      MaterialParser._parseTextureTransform(material, specularColorTexture.extensions, context);
    }
  }
}
