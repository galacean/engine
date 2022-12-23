import { Material } from "@oasis-engine/core";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IOasisMaterialRemap } from "./Schema";

@registerExtension("OASIS_materials_remap")
class OasisMaterialsRemap extends ExtensionParser {
  createEngineResource(schema: IOasisMaterialRemap, context: ParserContext): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
