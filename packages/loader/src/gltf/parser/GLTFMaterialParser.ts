import {
  AssetPromise,
  Logger,
  Material,
  PBRMaterial,
  PBRSpecularMaterial,
  RenderFace,
  Texture2D,
  TextureCoordinate,
  UnlitMaterial
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { IMaterial, ITextureInfo, MaterialAlphaMode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

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
  static _parseStandardProperty(
    context: GLTFParserContext,
    material: UnlitMaterial | PBRMaterial | PBRSpecularMaterial,
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
        context
          .get<Texture2D>(GLTFParserType.Texture, baseColorTexture.index)
          .then((texture) => {
            material.baseTexture = texture;
            GLTFParser.executeExtensionsAdditiveAndParse(
              baseColorTexture.extensions,
              context,
              material,
              baseColorTexture
            );
          })
          .catch((e) => {
            Logger.error("GLTFMaterialParser: baseColorTexture error", e);
          });
      }

      if (material.constructor === PBRMaterial) {
        material.metallic = metallicFactor ?? 1;
        material.roughness = roughnessFactor ?? 1;
        if (metallicRoughnessTexture) {
          GLTFMaterialParser._checkOtherTextureTransform(metallicRoughnessTexture, "Roughness metallic");
          context
            .get<Texture2D>(GLTFParserType.Texture, metallicRoughnessTexture.index)
            .then((texture) => {
              material.roughnessMetallicTexture = texture;
            })
            .catch((e) => {
              Logger.error("GLTFMaterialParser: metallicRoughnessTexture error", e);
            });
        }
      }
    }

    if (material.constructor === PBRMaterial || material.constructor === PBRSpecularMaterial) {
      if (emissiveTexture) {
        GLTFMaterialParser._checkOtherTextureTransform(emissiveTexture, "Emissive");
        context
          .get<Texture2D>(GLTFParserType.Texture, emissiveTexture.index)
          .then((texture) => {
            material.emissiveTexture = texture;
          })
          .catch((e) => {
            Logger.error("GLTFMaterialParser: emissiveTexture error", e);
          });
      }

      if (emissiveFactor) {
        material.emissiveColor.set(emissiveFactor[0], emissiveFactor[1], emissiveFactor[2], 1.0);
      }

      if (normalTexture) {
        const { index, scale } = normalTexture;
        GLTFMaterialParser._checkOtherTextureTransform(normalTexture, "Normal");

        context
          .get<Texture2D>(GLTFParserType.Texture, index)
          .then((texture) => {
            material.normalTexture = texture;
          })
          .catch((e) => {
            Logger.error("GLTFMaterialParser: emissiveTexture error", e);
          });

        if (scale !== undefined) {
          material.normalTextureIntensity = scale;
        }
      }

      if (occlusionTexture) {
        const { index, strength, texCoord } = occlusionTexture;
        GLTFMaterialParser._checkOtherTextureTransform(occlusionTexture, "Occlusion");

        context
          .get<Texture2D>(GLTFParserType.Texture, index)
          .then((texture) => {
            material.occlusionTexture = texture;
          })
          .catch((e) => {
            Logger.error("GLTFMaterialParser: occlusionTexture error", e);
          });

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

  parse(context: GLTFParserContext, index: number): AssetPromise<Material> {
    const materialInfo = context.glTF.materials[index];
    const glTFResource = context.glTFResource;
    const engine = glTFResource.engine;

    let material = <Material | Promise<Material>>(
      GLTFParser.executeExtensionsCreateAndParse(materialInfo.extensions, context, materialInfo)
    );

    if (!material) {
      material = new PBRMaterial(engine);
      material.name = materialInfo.name;
      GLTFMaterialParser._parseStandardProperty(context, material as PBRMaterial, materialInfo);
    }

    return AssetPromise.resolve(material).then((material) => {
      // @ts-ignore
      material ||= engine._basicResources._getBlinnPhongMaterial();
      GLTFParser.executeExtensionsAdditiveAndParse(materialInfo.extensions, context, material, materialInfo);
      // @ts-ignore
      material._associationSuperResource(glTFResource);
      return material;
    });
  }
}
