import { Logger, PBRBaseMaterial, UnlitMaterial } from "@galacean/engine-core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRTextureTransform } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_texture_transform", GLTFExtensionMode.AdditiveParse)
class KHR_texture_transform extends GLTFExtensionParser {
  override additiveParse(
    context: GLTFParserContext,
    material: PBRBaseMaterial | UnlitMaterial,
    schema: IKHRTextureTransform
  ): void {
    const { offset, rotation, scale, texCoord } = schema;

    if (offset) {
      material.tilingOffset.z = offset[0];
      material.tilingOffset.w = offset[1];
    }

    if (scale) {
      material.tilingOffset.x = scale[0];
      material.tilingOffset.y = scale[1];
    }

    if (rotation) {
      Logger.warn("rotation in KHR_texture_transform is not supported now");
    }

    if (texCoord) {
      Logger.warn("texCoord in KHR_texture_transform is not supported now");
    }
  }
}
