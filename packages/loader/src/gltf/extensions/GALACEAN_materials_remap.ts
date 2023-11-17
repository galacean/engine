import { Material } from "@galacean/engine-core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IGalaceanMaterialRemap } from "./GLTFExtensionSchema";

@registerGLTFExtension("GALACEAN_materials_remap", GLTFExtensionMode.CreateAndParse)
class GALACEAN_materials_remap extends GLTFExtensionParser {
  override createAndParse(context: GLTFParserContext, schema: IGalaceanMaterialRemap): Promise<Material> {
    const { engine } = context.glTFResource;
    // @ts-ignore
    const promise = engine.resourceManager.getResourceByRef<Material>(schema);
    context._dispatchProgressEvent(undefined, promise);

    return promise;
  }
}
