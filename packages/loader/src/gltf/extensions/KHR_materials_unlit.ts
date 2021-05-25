import { UnlitMaterial } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsUnlit } from "./Schema";

@registerExtension("KHR_materials_unlit")
class KHR_materials_unlit extends ExtensionParser {
  createEngineResource(schema: IKHRMaterialsUnlit, context: GLTFResource): UnlitMaterial {
    const { engine } = context;
    const material = new UnlitMaterial(engine);

    return material;
  }
}
