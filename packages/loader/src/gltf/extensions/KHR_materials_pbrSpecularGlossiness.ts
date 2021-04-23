import { PBRSpecularMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsPbrSpecularGlossiness } from "./schema";

@registerExtension("KHR_materials_pbrSpecularGlossiness")
class KHR_materials_pbrSpecularGlossiness extends ExtensionParser {
  createEngineResource(schema: IKHRMaterialsPbrSpecularGlossiness, context: GLTFResource): PBRSpecularMaterial {
    const { engine, textures } = context;
    const material = new PBRSpecularMaterial(engine);
    const { diffuseFactor, diffuseTexture, specularFactor, glossinessFactor, specularGlossinessTexture } = schema;

    if (diffuseFactor) {
      material.baseColor = new Color(...diffuseFactor);
    }

    if (diffuseTexture) {
      material.baseTexture = textures[diffuseTexture.index];
    }

    if (specularFactor) {
      material.specularColor = new Color(...specularFactor);
    }

    if (glossinessFactor !== undefined) {
      material.glossinessFactor = glossinessFactor;
    }

    if (specularGlossinessTexture) {
      material.specularGlossinessTexture = textures[specularGlossinessTexture.index];
    }

    return material;
  }
}
