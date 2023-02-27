import { Material } from "@oasis-engine/core";
import { IMaterial } from "../GLTFSchema";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionParser } from "./GLTFExtensionParser";
import { IOasisMaterialRemap } from "./GLTFExtensionSchema";

@registerGLTFExtension("OASIS_materials_remap")
class OasisMaterialsRemap extends GLTFExtensionParser<IMaterial> {
  createEngineResource(context: GLTFParserContext, schema: IOasisMaterialRemap): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
