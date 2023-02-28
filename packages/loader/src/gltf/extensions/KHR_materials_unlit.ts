import { UnlitMaterial } from "@oasis-engine/core";
import { IMaterial } from "../GLTFSchema";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";

@registerGLTFExtension("KHR_materials_unlit", GLTFExtensionMode.CreateAndParse)
class KHR_materials_unlit extends GLTFExtensionParser {
  createAndParse(context: GLTFParserContext, _, ownerSchema: IMaterial): UnlitMaterial {
    const { engine } = context.glTFResource;
    const material = new UnlitMaterial(engine);
    material.name = ownerSchema.name;

    GLTFMaterialParser._parseGLTFMaterial(context, material, ownerSchema);
    return material;
  }
}
