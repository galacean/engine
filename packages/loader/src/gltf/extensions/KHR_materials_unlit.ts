import { UnlitMaterial } from "@oasis-engine/core";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsUnlit } from "./Schema";

@registerExtension("KHR_materials_unlit")
class KHR_materials_unlit extends ExtensionParser {
  createEngineResource(schema: IKHRMaterialsUnlit, context: ParserContext): UnlitMaterial {
    const { engine } = context.glTFResource;
    const material = new UnlitMaterial(engine);

    return material;
  }
}
