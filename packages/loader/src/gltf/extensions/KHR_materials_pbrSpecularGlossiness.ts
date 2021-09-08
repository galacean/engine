import { PBRSpecularMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { MaterialParser } from "../parser/MaterialParser";
import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRMaterialsPbrSpecularGlossiness } from "./Schema";

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
      MaterialParser._parseTextureTransform(material, diffuseTexture.extensions, context);
    }

    if (specularFactor) {
      material.specularColor = new Color(...specularFactor);
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
