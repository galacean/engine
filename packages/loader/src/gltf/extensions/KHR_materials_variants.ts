import { Renderer } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialVariants_Mapping } from "./Schema";

@registerExtension("KHR_materials_variants")
class KHR_materials_variants extends ExtensionParser {
  parseEngineResource(schema: IKHRMaterialVariants_Mapping, renderer: Renderer, context: GLTFResource): void {
    const {
      gltf: {
        extensions: {
          KHR_materials_variants: { variants: variantNames }
        }
      },
      materials
    } = context;
    const { mappings } = schema;

    for (let i = 0; i < mappings.length; i++) {
      const { material, variants } = mappings[i];
      if (!context.variants) context.variants = [];
      context.variants.push({
        renderer,
        material: materials[material],
        variants: variants.map((index) => variantNames[index].name)
      });
    }
  }
}
