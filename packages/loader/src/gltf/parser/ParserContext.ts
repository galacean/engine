import { Buffer, TypedArray } from "@oasis-engine/core";
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

  bufferDataCache: Record<string, IBufferInfo> = {};
  vertexBufferCache: Record<string, { bindIndex: number; buffer: Buffer }> = {};
}

export interface IBufferInfo {
  data: TypedArray;
  interleaved: boolean;
  stride: number;
  vertexBindindex?: number;
}
