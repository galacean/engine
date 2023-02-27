import { Material } from "@oasis-engine/core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionParser } from "./GLTFExtensionParser";
import { IOasisMaterialRemap } from "./Schema";

@registerGLTFExtension("OASIS_materials_remap")
class OasisMaterialsRemap extends GLTFExtensionParser {
  createEngineResource(schema: IOasisMaterialRemap, context: GLTFParserContext): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
