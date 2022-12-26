import { AnimationClip, AssetPromise, Buffer, Material, ModelMesh, Texture2D, TypedArray } from "@oasis-engine/core";
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
  /** chain asset promise */
  chainPromises: AssetPromise<any>[] = [];
  accessorBufferCache: Record<string, BufferInfo> = {};
  subAssetFiflter: Function;
  query: string;

  texturesPromiseInfo: PromiseInfo<Texture2D[]>;
  materialsPromiseInfo: PromiseInfo<Material[]>;
  meshesPromiseInfo: PromiseInfo<ModelMesh[][]>;
  animationClipsPromiseInfo: PromiseInfo<AnimationClip[]>;

  constructor() {
    const texturesPromise = new AssetPromise<Texture2D[]>(function (resolve) {
      this.texturesPromiseInfo = new PromiseInfo<Texture2D[]>(texturesPromise, resolve);
    });
    const materialsPromise = new AssetPromise<Material[]>(function (resolve) {
      this.materialsPromiseInfo = new PromiseInfo<Material[]>(materialsPromise, resolve);
    });
    const meshedPromise = new AssetPromise<ModelMesh[][]>(function (resolve) {
      this.meshesPromiseInfo = new PromiseInfo<ModelMesh[][]>(meshedPromise, resolve);
    });
    const animationClipsPromise = new AssetPromise<AnimationClip[]>(function (resolve) {
      this.animationClipsPromiseInfo = new PromiseInfo<AnimationClip[]>(animationClipsPromise, resolve);
    });
  }
}

export class BufferInfo {
  vertxBuffer: Buffer;
  vertexBindingInfos: Record<number, number> = {};
  constructor(public data: TypedArray, public interleaved: boolean, public stride: number) {}
}

export class PromiseInfo<T> {
  constructor(public promise: AssetPromise<T>, public resolve: (value?: T | PromiseLike<T>) => void) {}
}
