import { Material } from "@oasis-engine/core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IOasisMaterialRemap } from "./GLTFExtensionSchema";

@registerGLTFExtension("OASIS_materials_remap", GLTFExtensionMode.CreateAndParse)
class OasisMaterialsRemap extends GLTFExtensionParser {
  /**
   * @override
   */
  createAndParse(context: GLTFParserContext, schema: IOasisMaterialRemap): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
