import { UnlitMaterial } from "@oasis-engine/core";
import { IMaterial } from "../GLTFSchema";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionParser } from "./GLTFExtensionParser";

@registerGLTFExtension("KHR_materials_unlit")
class KHR_materials_unlit extends GLTFExtensionParser<IMaterial> {
  createEngineResource(context: GLTFParserContext): UnlitMaterial {
    const { engine } = context.glTFResource;
    const material = new UnlitMaterial(engine);

    return material;
  }
}
