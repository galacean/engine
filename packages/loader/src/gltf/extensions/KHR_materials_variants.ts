import { Renderer } from "@oasis-engine/core";
import { IMeshPrimitive } from "../GLTFSchema";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialVariants_Mapping } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_variants")
class KHR_materials_variants extends GLTFExtensionParser<IMeshPrimitive> {
  parseEngineResource(context: GLTFParserContext, renderer: Renderer, schema: IKHRMaterialVariants_Mapping): void {
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
