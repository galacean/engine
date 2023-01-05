import { Logger, PBRSpecularMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { Parser, registerExtension } from "../parser/Parser";
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
      const KHR_texture_transform = diffuseTexture.extensions?.KHR_texture_transform;
      if (KHR_texture_transform) {
        Parser.parseEngineResource("KHR_texture_transform", KHR_texture_transform, material, context);
      }
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
      if (specularGlossinessTexture.extensions?.KHR_texture_transform) {
        Logger.warn("Specular glossiness texture always use the KHR_texture_transform of the base texture.");
      }
    }

    return material;
  }
}
