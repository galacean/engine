import {
  AssetPromise,
  BaseMaterial,
  Logger,
  Material,
  PBRBaseMaterial,
  PBRMaterial,
  RenderFace,
  TextureCoordinate
} from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
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

  parse(context: GLTFParserContext): AssetPromise<Material[]> {
    const { gltf, glTFResource, materialsPromiseInfo } = context;
    if (!gltf.materials) return;

    const { engine } = glTFResource;

    let materialPromises = [];

    for (let i = 0; i < gltf.materials.length; i++) {
      const materialInfo = gltf.materials[i];
      const { extensions = {}, name = "" } = materialInfo;

      let material: BaseMaterial | Promise<BaseMaterial> = null;

      const extensionArray = Object.keys(extensions);
      for (let i = extensionArray.length - 1; i >= 0; --i) {
        const extensionName = extensionArray[i];
        const extensionSchema = extensions[extensionName];

        material = <Promise<BaseMaterial> | BaseMaterial>(
          GLTFParser.createAndParse(extensionName, context, extensionSchema, materialInfo)
        );
        if (material) {
          break;
        }
      }

      if (!material) {
        material = new PBRMaterial(engine);
        material.name = name;
        GLTFMaterialParser._parseGLTFMaterial(context, material, materialInfo);
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
  static _parseGLTFMaterial(context: GLTFParserContext, material: BaseMaterial, materialInfo: IMaterial) {
    const { textures } = context.glTFResource;
    const {
      extensions = {},
      pbrMetallicRoughness,
      normalTexture,
      occlusionTexture,
      emissiveTexture,
      emissiveFactor,
      alphaMode,
      alphaCutoff,
      doubleSided
    } = materialInfo;

    const { KHR_materials_unlit, KHR_materials_pbrSpecularGlossiness, KHR_materials_clearcoat } = extensions;

    if (pbrMetallicRoughness) {
      const m = material as PBRBaseMaterial;
      const { baseColorFactor, baseColorTexture, metallicFactor, roughnessFactor, metallicRoughnessTexture } =
        pbrMetallicRoughness;

      if (baseColorFactor) {
        m.baseColor = new Color(
          Color.linearToGammaSpace(baseColorFactor[0]),
          Color.linearToGammaSpace(baseColorFactor[1]),
          Color.linearToGammaSpace(baseColorFactor[2]),
          baseColorFactor[3]
        );
      }
      if (baseColorTexture) {
        m.baseTexture = textures[baseColorTexture.index];
        const KHR_texture_transform = baseColorTexture.extensions?.KHR_texture_transform;
        if (KHR_texture_transform) {
          GLTFParser.additiveParse("KHR_texture_transform", context, material, KHR_texture_transform, materialInfo);
        }
      }

      if (!KHR_materials_unlit && !KHR_materials_pbrSpecularGlossiness) {
        const m = material as PBRMaterial;
        m.metallic = metallicFactor ?? 1;
        m.roughness = roughnessFactor ?? 1;
        if (metallicRoughnessTexture) {
          m.roughnessMetallicTexture = textures[metallicRoughnessTexture.index];
          GLTFMaterialParser._checkOtherTextureTransform(metallicRoughnessTexture, "Roughness metallic");
        }
      }
    }

    if (!KHR_materials_unlit) {
      const m = material as PBRBaseMaterial;

      if (emissiveTexture) {
        m.emissiveTexture = textures[emissiveTexture.index];
        GLTFMaterialParser._checkOtherTextureTransform(emissiveTexture, "Emissive");
      }

      if (emissiveFactor) {
        m.emissiveColor = new Color(
          Color.linearToGammaSpace(emissiveFactor[0]),
          Color.linearToGammaSpace(emissiveFactor[1]),
          Color.linearToGammaSpace(emissiveFactor[2])
        );
      }

      if (normalTexture) {
        const { index, scale } = normalTexture;
        m.normalTexture = textures[index];
        GLTFMaterialParser._checkOtherTextureTransform(normalTexture, "Normal");

        if (scale !== undefined) {
          m.normalTextureIntensity = scale;
        }
      }

      if (occlusionTexture) {
        const { index, strength, texCoord } = occlusionTexture;
        m.occlusionTexture = textures[index];
        GLTFMaterialParser._checkOtherTextureTransform(occlusionTexture, "Occlusion");

        if (strength !== undefined) {
          m.occlusionTextureIntensity = strength;
        }
        if (texCoord === TextureCoordinate.UV1) {
          m.occlusionTextureCoord = TextureCoordinate.UV1;
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
