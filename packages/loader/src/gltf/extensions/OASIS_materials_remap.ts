import { Material } from "@oasis-engine/core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IOasisMaterialRemap } from "./GLTFExtensionSchema";

@registerGLTFExtension("OASIS_materials_remap")
class OasisMaterialsRemap extends GLTFExtensionParser {
  mode = GLTFExtensionMode.CreateAndParse;

  createAndParse(context: GLTFParserContext, schema: IOasisMaterialRemap): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
