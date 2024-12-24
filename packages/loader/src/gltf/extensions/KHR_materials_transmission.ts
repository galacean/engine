import { PBRMaterial, Texture2D, RefractionMode } from "@galacean/engine-core";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsTransmission } from "./GLTFExtensionSchema";
@registerGLTFExtension("KHR_materials_transmission", GLTFExtensionMode.AdditiveParse)
class KHR_materials_transmission extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, material: PBRMaterial, schema: IKHRMaterialsTransmission): void {
    const { transmissionFactor = 0, transmissionTexture } = schema;
    material.refractionMode = RefractionMode.Plane;
    material.transmission = transmissionFactor;

    if (transmissionTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(transmissionTexture, "Transmission texture");

      context.get<Texture2D>(GLTFParserType.Texture, transmissionTexture.index).then((texture) => {
        material.transmissionTexture = texture;
      });
    }
  }
}
