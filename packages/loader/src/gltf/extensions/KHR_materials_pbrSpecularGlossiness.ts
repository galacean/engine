import { PBRSpecularMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsPbrSpecularGlossiness } from "./Schema";

@registerExtension("KHR_materials_pbrSpecularGlossiness")
class KHR_materials_pbrSpecularGlossiness extends ExtensionParser {
  createEngineResource(schema: IKHRMaterialsPbrSpecularGlossiness, context: ParserContext): PBRSpecularMaterial {
    const { engine, textures } = context.glTFResource;
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
      material.baseTexture = textures[diffuseTexture.index];
      MaterialParser._parseTextureTransform(material, diffuseTexture.extensions, context);
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
      material.specularGlossinessTexture = textures[specularGlossinessTexture.index];
      MaterialParser._parseTextureTransform(material, specularGlossinessTexture.extensions, context);
    }

    return material;
  }
}
