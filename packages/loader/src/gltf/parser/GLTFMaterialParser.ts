import {
  AssetPromise,
  BaseMaterial,
  Logger,
  Material,
  PBRBaseMaterial,
  PBRMaterial,
  PBRSpecularMaterial,
  RenderFace,
  TextureCoordinate,
  UnlitMaterial
} from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { IMaterial, ITextureInfo, MaterialAlphaMode } from "../Schema";
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

    let promises = [];

    for (let i = 0; i < gltf.materials.length; i++) {
      const materialInfo = gltf.materials[i];
      const { extensions = {}, name = "" } = materialInfo;

      const { KHR_materials_unlit, KHR_materials_pbrSpecularGlossiness, KHR_materials_clearcoat, ...otherExtensions } =
        extensions;
      let material: BaseMaterial | Promise<BaseMaterial> = null;

      for (let name in otherExtensions) {
        if (GLTFParser.hasExtensionParser(name)) {
          material = <Promise<any>>GLTFParser.createEngineResource(name, otherExtensions[name], context);
          if (material) {
            break;
          }
        }
      }

      if (!material) {
        if (KHR_materials_unlit) {
          material = <UnlitMaterial>GLTFParser.createEngineResource("KHR_materials_unlit", KHR_materials_unlit, context);
        } else if (KHR_materials_pbrSpecularGlossiness) {
          material = <PBRSpecularMaterial>(
            GLTFParser.createEngineResource(
              "KHR_materials_pbrSpecularGlossiness",
              KHR_materials_pbrSpecularGlossiness,
              context
            )
          );
        } else {
          material = new PBRMaterial(engine);
        }
        material.name = name;
        this._parseGLTFMaterial(material, materialInfo, context);
      }

      promises.push(material);
    }

    return AssetPromise.all(promises).then((materials) => {
      glTFResource.materials = materials;
      materialsPromiseInfo.resolve(materials);
      return materialsPromiseInfo.promise;
    });
  }

  private _parseGLTFMaterial(material: BaseMaterial, materialInfo: IMaterial, context: GLTFParserContext) {
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

    if (KHR_materials_clearcoat) {
      GLTFParser.parseEngineResource("KHR_materials_clearcoat", KHR_materials_clearcoat, material, context);
    }

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
          GLTFParser.parseEngineResource("KHR_texture_transform", KHR_texture_transform, material, context);
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
