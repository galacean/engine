import { Material, PBRMaterial, PBRSpecularMaterial, RenderFace, UnlitMaterial } from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { Parser } from "./Parser";

export class MaterialParser extends Parser {
  parse(context: GLTFResource): void {
    const { gltf, engine, textures } = context;
    if (!gltf.materials) return;

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
        doubleSided
      } = gltf.materials[i];

      const { KHR_materials_unlit, KHR_materials_pbrSpecularGlossiness } = extensions;

      let material: UnlitMaterial | PBRMaterial | PBRSpecularMaterial = null;

      if (KHR_materials_unlit) {
        material = this.createEngineResource<UnlitMaterial>("KHR_materials_unlit", KHR_materials_unlit, context);
      } else if (KHR_materials_pbrSpecularGlossiness) {
        material = this.createEngineResource<PBRSpecularMaterial>(
          "KHR_materials_pbrSpecularGlossiness",
          KHR_materials_pbrSpecularGlossiness,
          context
        );
      } else {
        material = new PBRMaterial(engine);
      }

      if (pbrMetallicRoughness) {
        const {
          baseColorFactor,
          baseColorTexture,
          metallicFactor,
          roughnessFactor,
          metallicRoughnessTexture
        } = pbrMetallicRoughness;

        if (baseColorFactor) {
          material.baseColor = new Color(...baseColorFactor);
        }
        if (baseColorTexture) {
          material.baseTexture = textures[baseColorTexture.index];
        }

        if (!KHR_materials_unlit && !KHR_materials_pbrSpecularGlossiness) {
          material = material as PBRMaterial;
          material.metallicFactor = metallicFactor ?? 1;
          material.roughnessFactor = roughnessFactor ?? 1;
          if (metallicRoughnessTexture) {
            material.metallicRoughnessTexture = textures[metallicRoughnessTexture.index];
          }
        }
      }

      if (!KHR_materials_unlit) {
        material = material as PBRMaterial | PBRSpecularMaterial;

        if (emissiveTexture) {
          material.emissiveTexture = textures[emissiveTexture.index];
        }

        if (emissiveFactor) {
          material.emissiveColor = new Color(...emissiveFactor);
        }

        if (normalTexture) {
          const { index, scale } = normalTexture;
          material.normalTexture = textures[index];
          if (scale !== undefined) {
            material.normalIntensity = scale;
          }
        }

        if (occlusionTexture) {
          const { index, strength } = occlusionTexture;
          material.occlusionTexture = textures[index];
          if (strength !== undefined) {
            material.occlusionStrength = strength;
          }
        }
      }

      if (doubleSided) {
        material.renderFace = RenderFace.Double;
      } else {
        material.renderFace = RenderFace.Front;
      }

      switch (alphaMode) {
        case "OPAQUE":
          material.isTransparent = false;
          break;
        case "BLEND":
          material.isTransparent = true;
          break;
        case "MASK":
          material.alphaCutoff = alphaCutoff ?? 0.5;
          break;
      }

      materials[i] = material;
    }

    context.materials = materials;
  }
}
