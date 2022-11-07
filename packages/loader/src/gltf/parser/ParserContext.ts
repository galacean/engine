import { GLTFResource } from "../GLTFResource";
import { IGLTF } from "../Schema";

/**
 * @internal
 */
export class ParserContext {
  gltf: IGLTF;
  buffers: ArrayBuffer[];
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
