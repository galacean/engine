import { Logger, PBRBaseMaterial, UnlitMaterial } from "@oasis-engine/core";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRTextureTransform } from "./Schema";

@registerExtension("KHR_texture_transform")
class KHR_texture_transform extends ExtensionParser {
  parseEngineResource(
    schema: IKHRTextureTransform,
    material: PBRBaseMaterial | UnlitMaterial,
    context: ParserContext
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
