import { PBRMaterial } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsTransmission } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_transmission", GLTFExtensionMode.AdditiveParse)
class KHR_materials_transmission extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsTransmission): void {
    const { transmissionFactor = 0, transmissionTexture } = schema;
    material.transmission = transmissionFactor;

    if (transmissionTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(transmissionTexture, "Transmission texture");
      GLTFMaterialParser._bindTexture(
        context,
        material,
        transmissionTexture.index,
        (texture) => {
          material.transmissionTexture = texture;
        },
        "KHR_materials_transmission: transmission texture error"
      );
    }
  }
}
