import { Renderer } from "@oasis-engine/core";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialVariants_Mapping } from "./Schema";

@registerExtension("KHR_materials_variants")
class KHR_materials_variants extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialVariants_Mapping, renderer: Renderer, context: ParserContext): void {
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
