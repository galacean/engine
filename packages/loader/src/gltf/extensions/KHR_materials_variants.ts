import { Logger, Material, Renderer } from "@galacean/engine-core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialVariants_Mapping } from "./GLTFExtensionSchema";

export type IGLTFExtensionVariants = Array<{
  renderer: Renderer;
  material: Material;
  variants: string[];
}>;

@registerGLTFExtension("KHR_materials_variants", GLTFExtensionMode.AdditiveParse)
class KHR_materials_variants extends GLTFExtensionParser {
  override additiveParse(context: GLTFParserContext, renderer: Renderer, schema: IKHRMaterialVariants_Mapping): void {
    const {
      glTF: {
        extensions: {
          KHR_materials_variants: { variants: variantNames }
        }
      },
      glTFResource
    } = context;
    const { mappings } = schema;

    glTFResource._extensionsData ||= {};
    const extensionData: IGLTFExtensionVariants = [];
    glTFResource.extensionsData.variants = extensionData;

    for (let i = 0; i < mappings.length; i++) {
      const { material: materialIndex, variants } = mappings[i];
      context
        .get<Material>(GLTFParserType.Material, materialIndex)
        .then((material) => {
          extensionData.push({
            renderer,
            material,
            variants: variants.map((index) => variantNames[index].name)
          });
        })
        .catch((e) => {
          Logger.error("KHR_materials_variants: material error", e);
        });
    }
  }
}
