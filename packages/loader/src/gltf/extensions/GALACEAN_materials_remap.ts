import { Material } from "@galacean/engine-core";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IGalaceanMaterialRemap } from "./Schema";

@registerExtension("OASIS_materials_remap")
class GalaceanMaterialsRemap extends ExtensionParser {
  createEngineResource(schema: IGalaceanMaterialRemap, context: ParserContext): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
