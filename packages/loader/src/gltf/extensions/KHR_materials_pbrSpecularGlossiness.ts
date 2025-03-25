import { PBRSpecularMaterial, Texture2D } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import type { IMaterial } from "../GLTFSchema";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { GLTFParser, registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsPbrSpecularGlossiness } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_pbrSpecularGlossiness", GLTFExtensionMode.CreateAndParse)
class KHR_materials_pbrSpecularGlossiness extends GLTFExtensionParser {
  override createAndParse(
    context: GLTFParserContext,
    schema: IKHRMaterialsPbrSpecularGlossiness,
    ownerSchema: IMaterial
  ): PBRSpecularMaterial {
    const engine = context.glTFResource.engine;
    const material = new PBRSpecularMaterial(engine);
    const { diffuseFactor, diffuseTexture, specularFactor, glossinessFactor, specularGlossinessTexture } = schema;

    if (diffuseFactor) {
      material.baseColor = new Color(
        Color.linearToGammaSpace(diffuseFactor[0]),
        Color.linearToGammaSpace(diffuseFactor[1]),
        Color.linearToGammaSpace(diffuseFactor[2]),
        diffuseFactor[3]
      );
    }

    if (diffuseTexture) {
      context.get<Texture2D>(GLTFParserType.Texture, diffuseTexture.index).then((texture) => {
        material.baseTexture = texture;
        GLTFParser.executeExtensionsAdditiveAndParse(diffuseTexture.extensions, context, material, diffuseTexture);
      });
    }

    if (specularFactor) {
      material.specularColor = new Color(
        Color.linearToGammaSpace(specularFactor[0]),
        Color.linearToGammaSpace(specularFactor[1]),
        Color.linearToGammaSpace(specularFactor[2])
      );
    }

    if (glossinessFactor !== undefined) {
      material.glossiness = glossinessFactor;
    }

    if (specularGlossinessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(specularGlossinessTexture, "Specular glossiness");

      context.get<Texture2D>(GLTFParserType.Texture, specularGlossinessTexture.index).then((texture) => {
        material.specularGlossinessTexture = texture;
      });
    }

    material.name = ownerSchema.name;
    GLTFMaterialParser._parseStandardProperty(context, material, ownerSchema);
    return material;
  }
}
