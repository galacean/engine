import {
  AssetPromise,
  Logger,
  Material,
  PBRMaterial,
  PBRSpecularMaterial,
  RenderFace,
  TextureCoordinate,
  UnlitMaterial
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { IMaterial, ITextureInfo, MaterialAlphaMode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFMaterialParser extends GLTFParser {
  /**
   * @internal
   */
  static _checkOtherTextureTransform(texture: ITextureInfo, textureName: string): void {
    if (texture.extensions?.KHR_texture_transform) {
      Logger.warn(`${textureName} texture always use the KHR_texture_transform of the base texture.`);
    }
  }

  /**
   * @internal
   */
  static _parseStandardProperty(
    context: GLTFParserContext,
    material: UnlitMaterial | PBRMaterial | PBRSpecularMaterial,
    materialInfo: IMaterial
  ) {
    const { textures } = context.glTFResource;
    const {
      pbrMetallicRoughness,
      normalTexture,
      occlusionTexture,
      emissiveTexture,
      emissiveFactor,
      alphaMode,
      alphaCutoff,
      doubleSided
    } = materialInfo;

    if (pbrMetallicRoughness) {
      const { baseColorFactor, baseColorTexture, metallicFactor, roughnessFactor, metallicRoughnessTexture } =
        pbrMetallicRoughness;

      if (baseColorFactor) {
        material.baseColor = new Color(
          Color.linearToGammaSpace(baseColorFactor[0]),
          Color.linearToGammaSpace(baseColorFactor[1]),
          Color.linearToGammaSpace(baseColorFactor[2]),
          baseColorFactor[3]
        );
      }
      if (baseColorTexture) {
        material.baseTexture = textures[baseColorTexture.index];
        GLTFParser.executeExtensionsAdditiveAndParse(baseColorTexture.extensions, context, material, baseColorTexture);
      }

      if (material.constructor === PBRMaterial) {
        material.metallic = metallicFactor ?? 1;
        material.roughness = roughnessFactor ?? 1;
        if (metallicRoughnessTexture) {
          material.roughnessMetallicTexture = textures[metallicRoughnessTexture.index];
          GLTFMaterialParser._checkOtherTextureTransform(metallicRoughnessTexture, "Roughness metallic");
        }
      }
    }

    if (material.constructor === PBRMaterial || material.constructor === PBRSpecularMaterial) {
      if (emissiveTexture) {
        material.emissiveTexture = textures[emissiveTexture.index];
        GLTFMaterialParser._checkOtherTextureTransform(emissiveTexture, "Emissive");
      }

      if (emissiveFactor) {
        material.emissiveColor = new Color(
          Color.linearToGammaSpace(emissiveFactor[0]),
          Color.linearToGammaSpace(emissiveFactor[1]),
          Color.linearToGammaSpace(emissiveFactor[2])
        );
      }

      if (normalTexture) {
        const { index, scale } = normalTexture;
        material.normalTexture = textures[index];
        GLTFMaterialParser._checkOtherTextureTransform(normalTexture, "Normal");

        if (scale !== undefined) {
          material.normalTextureIntensity = scale;
        }
      }

      if (occlusionTexture) {
        const { index, strength, texCoord } = occlusionTexture;
        material.occlusionTexture = textures[index];
        GLTFMaterialParser._checkOtherTextureTransform(occlusionTexture, "Occlusion");

        if (strength !== undefined) {
          material.occlusionTextureIntensity = strength;
        }
        if (texCoord === TextureCoordinate.UV1) {
          material.occlusionTextureCoord = TextureCoordinate.UV1;
        } else if (texCoord > TextureCoordinate.UV1) {
          Logger.warn("Occlusion texture uv coordinate must be UV0 or UV1.");
        }
      }
    }

    if (doubleSided) {
      material.renderFace = RenderFace.Double;
    } else {
      material.renderFace = RenderFace.Front;
    }

    switch (alphaMode) {
      case MaterialAlphaMode.OPAQUE:
        material.isTransparent = false;
        break;
      case MaterialAlphaMode.BLEND:
        material.isTransparent = true;
        break;
      case MaterialAlphaMode.MASK:
        material.alphaCutoff = alphaCutoff ?? 0.5;
        break;
    }
  }

  parse(context: GLTFParserContext): AssetPromise<Material[]> {
    const { glTF, glTFResource, materialsPromiseInfo } = context;
    if (!glTF.materials) return;

    const { engine } = glTFResource;

    let materialPromises = [];

    for (let i = 0; i < glTF.materials.length; i++) {
      const materialInfo = glTF.materials[i];

      let material = <Material | Promise<Material>>(
        GLTFParser.executeExtensionsCreateAndParse(materialInfo.extensions, context, materialInfo)
      );

      if (!material) {
        material = new PBRMaterial(engine);
        material.name = materialInfo.name;
        GLTFMaterialParser._parseStandardProperty(context, material as PBRMaterial, materialInfo);
      }

      materialPromises.push(material);
    }

    return AssetPromise.all(materialPromises).then((materials) => {
      glTFResource.materials = materials;
      for (let i = 0; i < glTF.materials.length; i++) {
        const materialInfo = glTF.materials[i];
        GLTFParser.executeExtensionsAdditiveAndParse(materialInfo.extensions, context, materials[i], materialInfo);
      }
      materialsPromiseInfo.resolve(materials);
      return materialsPromiseInfo.promise;
    });
  }
}
