import {
  AssetPromise,
  Logger,
  Material,
  PBRMaterial,
  RenderFace,
  Texture2D,
  TextureCoordinate,
  UnlitMaterial
} from "@galacean/engine-core";
import { IMaterial, ITextureInfo, MaterialAlphaMode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

// @todo: remap plugin should have a higher priority storage location
const REMAP_NAME = "GALACEAN_materials_remap";

@registerGLTFParser(GLTFParserType.Material)
export class GLTFMaterialParser extends GLTFParser {
  /**
   * @internal
   */
  static _checkOtherTextureTransform(texture: ITextureInfo, textureName: string): void {
    if (texture.extensions?.KHR_texture_transform) {
      Logger.warn(`${textureName} texture ignore KHR_texture_transform extension.`);
    }
  }

  /**
   * @internal
   */
  static _bindTexture(
    context: GLTFParserContext,
    material: Material,
    textureIndex: number,
    onLoaded: (texture: Texture2D) => void,
    errorTag: string
  ): void {
    context
      .get<Texture2D>(GLTFParserType.Texture, textureIndex)
      .then((texture) => {
        if (!texture || context._isAborted || material.destroyed) {
          return;
        }
        onLoaded(texture);
      })
      .catch((e) => {
        if (!context._isAborted) {
          Logger.error(errorTag, e);
        }
      });
  }

  /**
   * @internal
   */
  static _parseStandardProperty(
    context: GLTFParserContext,
    material: UnlitMaterial | PBRMaterial,
    materialInfo: IMaterial
  ) {
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
        material.baseColor.copyFromArray(baseColorFactor);
      }
      if (baseColorTexture) {
        GLTFMaterialParser._bindTexture(
          context,
          material,
          baseColorTexture.index,
          (texture) => {
            material.baseTexture = texture;
            GLTFParser.executeExtensionsAdditiveAndParse(
              baseColorTexture.extensions,
              context,
              material,
              baseColorTexture
            );
          },
          "GLTFMaterialParser: baseColorTexture error"
        );
      }

      if (material.constructor === PBRMaterial) {
        material.metallic = metallicFactor ?? 1;
        material.roughness = roughnessFactor ?? 1;
        if (metallicRoughnessTexture) {
          GLTFMaterialParser._checkOtherTextureTransform(metallicRoughnessTexture, "Roughness metallic");
          GLTFMaterialParser._bindTexture(
            context,
            material,
            metallicRoughnessTexture.index,
            (texture) => {
              material.roughnessMetallicTexture = texture;
            },
            "GLTFMaterialParser: metallicRoughnessTexture error"
          );
        }
      }
    }

    if (material.constructor === PBRMaterial) {
      if (emissiveTexture) {
        GLTFMaterialParser._checkOtherTextureTransform(emissiveTexture, "Emissive");
        GLTFMaterialParser._bindTexture(
          context,
          material,
          emissiveTexture.index,
          (texture) => {
            material.emissiveTexture = texture;
          },
          "GLTFMaterialParser: emissiveTexture error"
        );
      }

      if (emissiveFactor) {
        material.emissiveColor.set(emissiveFactor[0], emissiveFactor[1], emissiveFactor[2], 1.0);
      }

      if (normalTexture) {
        const { index, scale } = normalTexture;
        GLTFMaterialParser._checkOtherTextureTransform(normalTexture, "Normal");
        GLTFMaterialParser._bindTexture(
          context,
          material,
          index,
          (texture) => {
            material.normalTexture = texture;
          },
          "GLTFMaterialParser: normalTexture error"
        );

        if (scale !== undefined) {
          material.normalTextureIntensity = scale;
        }
      }

      if (occlusionTexture) {
        const { index, strength, texCoord } = occlusionTexture;
        GLTFMaterialParser._checkOtherTextureTransform(occlusionTexture, "Occlusion");
        GLTFMaterialParser._bindTexture(
          context,
          material,
          index,
          (texture) => {
            material.occlusionTexture = texture;
          },
          "GLTFMaterialParser: occlusionTexture error"
        );

        if (strength !== undefined) {
          material.occlusionTextureIntensity = strength;
        }
        if (texCoord === TextureCoordinate.UV1) {
          material.occlusionTextureCoord = TextureCoordinate.UV1;
        } else if (texCoord !== undefined && texCoord > TextureCoordinate.UV1) {
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

  parse(context: GLTFParserContext, index: number): AssetPromise<Material> {
    const materialInfo = context.glTF.materials![index];
    const glTFResource = context.glTFResource;
    const engine = glTFResource.engine;
    let extensions = materialInfo.extensions || {};

    //Keep only the remap extension
    if (extensions[REMAP_NAME]) {
      extensions = {
        [REMAP_NAME]: extensions[REMAP_NAME]
      };
    }

    let material = <Material | Promise<Material>>(
      GLTFParser.executeExtensionsCreateAndParse(extensions, context, materialInfo)
    );

    if (!material) {
      material = context._trackResource(new PBRMaterial(engine));
      material.name = materialInfo.name!;
      GLTFMaterialParser._parseStandardProperty(context, material as PBRMaterial, materialInfo);
    }

    return AssetPromise.resolve(material).then((material) => {
      if (context._isAborted) {
        return material;
      }
      const isDefaultFallback = !material;
      material ||= engine._basicResources._getBlinnPhongMaterial();
      GLTFParser.executeExtensionsAdditiveAndParse(extensions, context, material, materialInfo);
      if (!isDefaultFallback) {
        glTFResource._associateResource(material);
      }
      return material;
    });
  }
}
