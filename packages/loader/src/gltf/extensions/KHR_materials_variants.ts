import { Renderer } from "@oasis-engine/core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialVariants_Mapping } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_variants")
class KHR_materials_variants extends GLTFExtensionParser {
  parseEngineResource(schema: IKHRMaterialVariants_Mapping, renderer: Renderer, context: GLTFParserContext): void {
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
