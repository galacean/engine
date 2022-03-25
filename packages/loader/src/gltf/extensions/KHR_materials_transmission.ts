import { PBRBaseMaterial } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsTransmission } from "./Schema";

@registerExtension("KHR_materials_transmission")
class KHR_materials_transmission extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialsTransmission, material: PBRBaseMaterial, context: GLTFResource): void {
    const { textures } = context;
    const { transmissionFactor = 0, transmissionTexture } = schema;

    material.refractionIntensity = transmissionFactor;

    if (transmissionTexture) {
      material.refractionIntensityTexture = textures[transmissionTexture.index];
      MaterialParser._parseTextureTransform(material, transmissionTexture.extensions, context);
    }
  }
}
