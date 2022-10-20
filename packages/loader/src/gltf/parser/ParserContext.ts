import { GLTFResource } from "../GLTFResource";

/**
 * @internal
 */
export class ParserContext {
  glTFResource: GLTFResource;
  keepMeshData: boolean;
  hasSkinned: boolean = false;
  /** adapter subAsset */
  textureIndex?: number;
  materialIndex?: number;
  animationIndex?: number;
  meshIndex?: number;
  subMeshIndex?: number;
  defaultSceneRootOnly?: boolean;
}
