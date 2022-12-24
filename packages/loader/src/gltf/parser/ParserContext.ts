import { Buffer, TypedArray } from "@oasis-engine/core";
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

  accessorBufferCache: Record<string, BufferInfo> = {};
}

export class BufferInfo {
  vertxBuffer: Buffer;
  vertexBindingInfos: Record<number, number> = {};
  constructor(public data: TypedArray, public interleaved: boolean, public stride: number) {}
}
