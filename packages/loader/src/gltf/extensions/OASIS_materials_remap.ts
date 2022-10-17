import { Material } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IOasisMaterialRemap } from "./Schema";

@registerExtension("OASIS_materials_remap")
class OasisMaterialsRemap extends ExtensionParser {
  createEngineResource(schema: IOasisMaterialRemap, context: GLTFResource): Promise<Material> {
    const { engine } = context;
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
