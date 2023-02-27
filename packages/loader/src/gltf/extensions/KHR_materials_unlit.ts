import { UnlitMaterial } from "@oasis-engine/core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsUnlit } from "./Schema";

@registerGLTFExtension("KHR_materials_unlit")
class KHR_materials_unlit extends GLTFExtensionParser {
  createEngineResource(schema: IKHRMaterialsUnlit, context: GLTFParserContext): UnlitMaterial {
    const { engine } = context.glTFResource;
    const material = new UnlitMaterial(engine);

    return material;
  }
}
