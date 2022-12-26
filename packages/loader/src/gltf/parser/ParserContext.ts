import {
  AnimationClip,
  AssetPromise,
  Buffer,
  Entity,
  Material,
  ModelMesh,
  Texture2D,
  TypedArray
} from "@oasis-engine/core";
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

  texturesPromiseInfo: PromiseInfo<Texture2D[]> = new PromiseInfo<Texture2D[]>();
  materialsPromiseInfo: PromiseInfo<Material[]> = new PromiseInfo<Material[]>();
  meshesPromiseInfo: PromiseInfo<ModelMesh[][]> = new PromiseInfo<ModelMesh[][]>();
  animationClipsPromiseInfo: PromiseInfo<AnimationClip[]> = new PromiseInfo<AnimationClip[]>();
  defaultSceneRootPromiseInfo: PromiseInfo<Entity> = new PromiseInfo<Entity>();
  masterPromiseInfo: PromiseInfo<GLTFResource> = new PromiseInfo<GLTFResource>();

  constructor() {
    this._initPromiseInfo(this.texturesPromiseInfo);
    this._initPromiseInfo(this.materialsPromiseInfo);
    this._initPromiseInfo(this.meshesPromiseInfo);
    this._initPromiseInfo(this.animationClipsPromiseInfo);
    this._initPromiseInfo(this.defaultSceneRootPromiseInfo);
    this._initPromiseInfo(this.masterPromiseInfo);
  }

  private _initPromiseInfo(promiseInfo): void {
    promiseInfo.promise = new AssetPromise<Texture2D[]>((resolve, reject, setProgress, onCancel) => {
      promiseInfo.resolve = resolve;
      promiseInfo.reject = reject;
      promiseInfo.setProgress = setProgress;
      promiseInfo.onCancel = onCancel;
    });
  }
}

/**
 * @internal
 */
export class BufferInfo {
  vertxBuffer: Buffer;
  vertexBindingInfos: Record<number, number> = {};
  constructor(public data: TypedArray, public interleaved: boolean, public stride: number) {}
}

/**
 * @internal
 */
export class PromiseInfo<T> {
  public promise: AssetPromise<T>;
  public resolve: (value?: T | PromiseLike<T>) => void;
  public reject: (reason?: any) => void;
  public setProgress: (progress: number) => void;
  public onCancel: (callback: () => void) => void;
}
