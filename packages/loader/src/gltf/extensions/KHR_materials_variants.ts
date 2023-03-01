import { Renderer } from "@oasis-engine/core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialVariants_Mapping } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_variants", GLTFExtensionMode.AdditiveParse)
class KHR_materials_variants extends GLTFExtensionParser {

  /**
   * @override
   */
  additiveParse(context: GLTFParserContext, renderer: Renderer, schema: IKHRMaterialVariants_Mapping): void {
    const {
      gltf: {
        extensions: {
          KHR_materials_variants: { variants: variantNames }
        }
      },
      glTFResource
    } = context;
    const { mappings } = schema;

    for (let i = 0; i < mappings.length; i++) {
      const { material, variants } = mappings[i];
      if (!glTFResource.variants) glTFResource.variants = [];
      glTFResource.variants.push({
        renderer,
        material: glTFResource.materials[material],
        variants: variants.map((index) => variantNames[index].name)
      });
    }
  }
}
