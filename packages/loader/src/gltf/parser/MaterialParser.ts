import {
  AssetPromise,
  Logger,
  Material,
  PBRMaterial,
  PBRSpecularMaterial,
  RenderFace,
  TextureCoordinate,
  UnlitMaterial
} from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { IKHRTextureTransform } from "../extensions/Schema";
import { MaterialAlphaMode } from "../Schema";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class MaterialParser extends Parser {
  /**
   * @internal
   */
  static _checkTextureTransform(
    baseTextureTransformDef: IKHRTextureTransform,
    otherTextureTransformDef: IKHRTextureTransform
  ): void {
    if (!baseTextureTransformDef) {
      return;
    }
    const baseOffset = baseTextureTransformDef.offset;
    const otherOffset = otherTextureTransformDef.offset;
    if (baseOffset && otherOffset) {
      if (baseOffset[0] !== otherOffset[0] || baseOffset[1] !== otherOffset[1]) {
        Logger.warn(
          "Only support base texture transform, the offset of other textures is different from the base texture."
        );
      }
    }

    const baseScale = baseTextureTransformDef.scale;
    const otherScale = otherTextureTransformDef.scale;
    if (baseScale && otherScale) {
      if (baseScale[0] !== otherScale[0] || baseScale[1] !== otherScale[1]) {
        Logger.warn(
          "Only support base texture transform, the scale of other textures is different from the base texture."
        );
      }
    }
  }

  parse(context: ParserContext): AssetPromise<Material[]> {
    const { gltf, glTFResource } = context;

    const { engine, textures } = glTFResource;
    if (!gltf.materials) return;

    const materialsPromiseInfo = context.materialsPromiseInfo;
    const materials: Material[] = [];

    for (let i = 0; i < gltf.materials.length; i++) {
      const {
        extensions = {},
        pbrMetallicRoughness,
        normalTexture,
        occlusionTexture,
        emissiveTexture,
        emissiveFactor,
        alphaMode,
        alphaCutoff,
        doubleSided,
        name = ""
      } = gltf.materials[i];

      const {
        KHR_materials_unlit,
        KHR_materials_pbrSpecularGlossiness,
        KHR_materials_clearcoat,
        OASIS_materials_remap
      } = extensions;

      let material: UnlitMaterial | PBRMaterial | PBRSpecularMaterial = null;

      if (KHR_materials_unlit) {
        material = <UnlitMaterial>Parser.createEngineResource("KHR_materials_unlit", KHR_materials_unlit, context);
      } else if (KHR_materials_pbrSpecularGlossiness) {
        material = <PBRSpecularMaterial>(
          Parser.createEngineResource(
            "KHR_materials_pbrSpecularGlossiness",
            KHR_materials_pbrSpecularGlossiness,
            context
          )
        );
      } else {
        material = new PBRMaterial(engine);
      }

      material.name = name;

      if (KHR_materials_clearcoat) {
        Parser.parseEngineResource("KHR_materials_clearcoat", KHR_materials_clearcoat, material, context);
      }

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
          Parser.parseEngineResource(
            "KHR_texture_transform",
            baseColorTexture.extensions.KHR_texture_transform,
            material,
            context
          );
        }

        if (!KHR_materials_unlit && !KHR_materials_pbrSpecularGlossiness) {
          const m = material as PBRMaterial;
          m.metallic = metallicFactor ?? 1;
          m.roughness = roughnessFactor ?? 1;
          if (metallicRoughnessTexture) {
            m.roughnessMetallicTexture = textures[metallicRoughnessTexture.index];
            if (metallicRoughnessTexture.extensions.KHR_texture_transform) {
              Logger.warn("Metallic roughness texture always use the KHR_texture_transform of the base texture.");
            }
          }
        }
      }

      if (!KHR_materials_unlit) {
        const m = material as PBRMaterial | PBRSpecularMaterial;

        if (emissiveTexture) {
          m.emissiveTexture = textures[emissiveTexture.index];
          if (emissiveTexture.extensions.KHR_texture_transform) {
            Logger.warn("Emissive texture, always use the KHR_texture_transform of the base texture.");
          }
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
          if (normalTexture.extensions.KHR_texture_transform) {
            Logger.warn("Normal texture always use the KHR_texture_transform of the base texture.");
          }

          if (scale !== undefined) {
            m.normalTextureIntensity = scale;
          }
        }

        if (occlusionTexture) {
          const { index, strength, texCoord } = occlusionTexture;
          m.occlusionTexture = textures[index];
          if (occlusionTexture.extensions.KHR_texture_transform) {
            Logger.warn("Occlusion texture always use the KHR_texture_transform of the base texture.");
          }
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

      if (OASIS_materials_remap) {
        gltf.extensions = gltf.extensions ?? {};
        gltf.extensions["OASIS_materials_remap"] = gltf.extensions["OASIS_materials_remap"] ?? {};
        gltf.extensions["OASIS_materials_remap"][i] = Parser.createEngineResource(
          "OASIS_materials_remap",
          OASIS_materials_remap,
          context
        );
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

      materials[i] = material;
    }

    glTFResource.materials = materials;
    materialsPromiseInfo.resolve(materials);
    return materialsPromiseInfo.promise;
  }
}
