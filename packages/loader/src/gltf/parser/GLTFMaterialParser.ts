import {
  AssetPromise,
  BaseMaterial,
  Logger,
  Material,
  PBRMaterial,
  PBRSpecularMaterial,
  RenderFace,
  TextureCoordinate,
  UnlitMaterial
} from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { IMaterial, ITextureInfo, MaterialAlphaMode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

type StandMaterialType = UnlitMaterial | PBRMaterial | PBRSpecularMaterial;

export class GLTFMaterialParser extends GLTFParser {
  /**
   * @internal
   */
  static _checkOtherTextureTransform(texture: ITextureInfo, textureName: string): void {
    if (texture.extensions?.KHR_texture_transform) {
      Logger.warn(`${textureName} texture always use the KHR_texture_transform of the base texture.`);
    }
  }

  parse(context: GLTFParserContext): AssetPromise<Material[]> {
    const { gltf, glTFResource, materialsPromiseInfo } = context;
    if (!gltf.materials) return;

    const { engine } = glTFResource;

    let materialPromises = [];

    for (let i = 0; i < gltf.materials.length; i++) {
      const materialInfo = gltf.materials[i];
      const { extensions = {}, name = "" } = materialInfo;

      let material: StandMaterialType | Promise<BaseMaterial> = null;

      const extensionArray = Object.keys(extensions);
      for (let i = extensionArray.length - 1; i >= 0; --i) {
        const extensionName = extensionArray[i];
        const extensionSchema = extensions[extensionName];

        material = <StandMaterialType | Promise<BaseMaterial>>(
          GLTFParser.createAndParse(extensionName, context, extensionSchema, materialInfo)
        );
        if (material) {
          break;
        }
      }

      if (!material) {
        material = new PBRMaterial(engine);
        material.name = name;
        GLTFMaterialParser._parseStandardProperty(context, material, materialInfo);
      }

      materialPromises.push(material);
    }

    return AssetPromise.all(materialPromises).then((materials) => {
      glTFResource.materials = materials;
      for (let i = 0; i < gltf.materials.length; i++) {
        const materialInfo = gltf.materials[i];
        const material = materials[i];
        const { extensions } = materialInfo;
        for (let extensionName in extensions) {
          const extensionSchema = extensions[extensionName];
          GLTFParser.additiveParse(extensionName, context, material, extensionSchema, materialInfo);
        }
      }
      materialsPromiseInfo.resolve(materials);
      return materialsPromiseInfo.promise;
    });
  }

  /**
   * @internal
   */
  static _parseStandardProperty(context: GLTFParserContext, material: StandMaterialType, materialInfo: IMaterial) {
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
        const KHR_texture_transform = baseColorTexture.extensions?.KHR_texture_transform;
        if (KHR_texture_transform) {
          GLTFParser.additiveParse("KHR_texture_transform", context, material, KHR_texture_transform, materialInfo);
        }
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
}
