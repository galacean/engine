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
import { BufferDataRestoreInfo, GLTFContentRestoreInfo } from "../../GLTFLoader";
import { GLTFResource } from "../GLTFResource";
import { IGLTF } from "../Schema";

/**
 * @internal
 */
export class ParserContext {
  glTF: IGLTF;
  buffers: ArrayBuffer[];
  glTFResource: GLTFResource;
  keepMeshData: boolean;
  hasSkinned: boolean = false;
  chainPromises: AssetPromise<any>[] = [];
  accessorBufferCache: Record<string, BufferInfo> = {};

  texturesPromiseInfo: PromiseInfo<Texture2D[]> = new PromiseInfo<Texture2D[]>();
  materialsPromiseInfo: PromiseInfo<Material[]> = new PromiseInfo<Material[]>();
  meshesPromiseInfo: PromiseInfo<ModelMesh[][]> = new PromiseInfo<ModelMesh[][]>();
  animationClipsPromiseInfo: PromiseInfo<AnimationClip[]> = new PromiseInfo<AnimationClip[]>();
  defaultSceneRootPromiseInfo: PromiseInfo<Entity> = new PromiseInfo<Entity>();
  masterPromiseInfo: PromiseInfo<GLTFResource> = new PromiseInfo<GLTFResource>();
  promiseMap: Record<string, AssetPromise<any>> = {};

  contentRestoreInfo: GLTFContentRestoreInfo = new GLTFContentRestoreInfo();

  constructor(url: string) {
    const promiseMap = this.promiseMap;
    promiseMap[`${url}?q=textures`] = this._initPromiseInfo(this.texturesPromiseInfo);
    promiseMap[`${url}?q=materials`] = this._initPromiseInfo(this.materialsPromiseInfo);
    promiseMap[`${url}?q=meshes`] = this._initPromiseInfo(this.meshesPromiseInfo);
    promiseMap[`${url}?q=animations`] = this._initPromiseInfo(this.animationClipsPromiseInfo);
    promiseMap[`${url}?q=defaultSceneRoot`] = this._initPromiseInfo(this.defaultSceneRootPromiseInfo);
    promiseMap[`${url}`] = this._initPromiseInfo(this.masterPromiseInfo);
  }

  private _initPromiseInfo(promiseInfo: PromiseInfo<any>): AssetPromise<any> {
    const promise = new AssetPromise<any>((resolve, reject, setProgress, onCancel) => {
      promiseInfo.resolve = resolve;
      promiseInfo.reject = reject;
      promiseInfo.setProgress = setProgress;
      promiseInfo.onCancel = onCancel;
    });
    promiseInfo.promise = promise;
    return promise;
  }
}

/**
 * @internal
 */
export class BufferInfo {
  vertexBuffer: Buffer;
  vertexBindingInfos: Record<number, number> = {};

  restoreInfo: BufferDataRestoreInfo;

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
