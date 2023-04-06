import { Material } from "@galacean/engine-core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IGalaceanMaterialRemap } from "./GLTFExtensionSchema";

@registerGLTFExtension("OASIS_materials_remap", GLTFExtensionMode.CreateAndParse)
class GalaceanMaterialsRemap extends GLTFExtensionParser {
  /**
   * @override
   */
  createAndParse(context: GLTFParserContext, schema: IGalaceanMaterialRemap): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    return engine.resourceManager.getResourceByRef<Material>(schema);
  }
}
