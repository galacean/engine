import { AssetPromise, TypedArray } from "@oasis-engine/core";
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
  /** chain asset promise */
  chainPromises: AssetPromise<any>[] = [];

  accessorBufferCache: Record<string, BufferInfo> = {};
}

export class BufferInfo {
  vertexBindingInfos: Record<number, number> = {};
  constructor(public data: TypedArray, public interleaved: boolean, public stride: number) {}
}
