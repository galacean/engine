import { PBRMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsSheen } from "./Schema";

@registerExtension("KHR_materials_sheen")
class KHR_materials_sheen extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsSheen, material: PBRMaterial, context: GLTFResource): void {
    const { textures } = context;
    const { sheenColorFactor, sheenColorTexture, sheenRoughnessFactor = 0, sheenRoughnessTexture } = schema;
    
    if (sheenColorFactor) {
      material.sheenEnabled = true;
      material.sheenColor = new Color(
        Color.linearToGammaSpace(sheenColorFactor[0]),
        Color.linearToGammaSpace(sheenColorFactor[1]),
        Color.linearToGammaSpace(sheenColorFactor[2])
      );
    }

    if (sheenColorTexture) {
      material.sheenColorTexture = textures[sheenColorTexture.index];
      MaterialParser._parseTextureTransform(material, sheenColorTexture.extensions, context);
    }

    material.sheenRoughness = sheenRoughnessFactor;

    if (sheenRoughnessTexture) {
      material.sheenRoughnessTexture = textures[sheenRoughnessTexture.index];
      MaterialParser._parseTextureTransform(material, sheenRoughnessTexture.extensions, context);
    }
  }
}
