import { PBRSpecularMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { IMaterial } from "../GLTFSchema";
import { GLTFMaterialParser } from "../parser/GLTFMaterialParser";
import { GLTFParser, registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRMaterialsPbrSpecularGlossiness } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_materials_pbrSpecularGlossiness", GLTFExtensionMode.CreateAndParse)
class KHR_materials_pbrSpecularGlossiness extends GLTFExtensionParser {
  createAndParse(
    context: GLTFParserContext,
    schema: IKHRMaterialsPbrSpecularGlossiness,
    ownerSchema: IMaterial
  ): PBRSpecularMaterial {
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
        GLTFParser.additiveParse("KHR_texture_transform", context, material, KHR_texture_transform, diffuseTexture);
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
      GLTFMaterialParser._checkOtherTextureTransform(specularGlossinessTexture, "Specular glossiness");
    }

    material.name = ownerSchema.name;
    GLTFMaterialParser._parseGLTFMaterial(context, material, ownerSchema);
    return material;
  }
}
