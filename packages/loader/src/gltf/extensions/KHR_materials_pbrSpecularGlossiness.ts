import { Logger, PBRSpecularMaterial, Texture2D } from "@galacean/engine-core";
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
      material.baseColor.copyFromArray(diffuseFactor);
    }

    if (diffuseTexture) {
      context
        .get<Texture2D>(GLTFParserType.Texture, diffuseTexture.index)
        .then((texture) => {
          material.baseTexture = texture;
          GLTFParser.executeExtensionsAdditiveAndParse(diffuseTexture.extensions, context, material, diffuseTexture);
        })
        .catch((e) => {
          Logger.error("KHR_materials_pbrSpecularGlossiness: diffuse texture error", e);
        });
    }

    if (specularFactor) {
      material.specularColor.set(specularFactor[0], specularFactor[1], specularFactor[2], 1.0);
    }

    if (glossinessFactor !== undefined) {
      material.glossiness = glossinessFactor;
    }

    if (specularGlossinessTexture) {
      GLTFMaterialParser._checkOtherTextureTransform(specularGlossinessTexture, "Specular glossiness");

      context
        .get<Texture2D>(GLTFParserType.Texture, specularGlossinessTexture.index)
        .then((texture) => {
          material.specularGlossinessTexture = texture;
        })
        .catch((e) => {
          Logger.error("KHR_materials_pbrSpecularGlossiness: specular glossiness texture error", e);
        });
    }

    material.name = ownerSchema.name;
    GLTFMaterialParser._parseStandardProperty(context, material, ownerSchema);
    return material;
  }
}
