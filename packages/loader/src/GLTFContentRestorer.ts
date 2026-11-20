import {
  AssetPromise,
  BlendShape,
  Buffer,
  ContentRestorer,
  ModelMesh,
  RequestConfig,
  Texture2D,
  TypedArray,
  request
} from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";
import { GLTFResource } from "./gltf/GLTFResource";
import type { AccessorComponentType, IBufferView } from "./gltf/GLTFSchema";
import { GLTFUtils } from "./gltf/GLTFUtils";
import type { IEXTMeshoptCompressionSchema } from "./gltf/extensions/GLTFExtensionSchema";
import { getMeshoptDecoder } from "./gltf/extensions/MeshoptDecoder";
import { ImageDecoder } from "./ImageDecoder";
import { KTX2Loader } from "./ktx2/KTX2Loader";

/**
 * @internal
 */
export class GLTFContentRestorer extends ContentRestorer<GLTFResource> {
  isGLB: boolean;
  bufferRequests: BufferRequestInfo[] = [];
  glbBufferSlices: Vector2[] = [];
  bufferTextures: BufferTextureRestoreInfo[] = [];
  meshes: ModelMeshRestoreInfo[] = [];

  override restoreContent(): AssetPromise<GLTFResource> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(
        this.bufferRequests.map((bufferRequestInfo) => {
          return bufferRequestInfo
            ? request<ArrayBuffer>(bufferRequestInfo.url, bufferRequestInfo.config)
            : Promise.resolve(undefined as unknown as ArrayBuffer);
        })
      )
        .then((buffers: ArrayBuffer[]) => {
          // Buffer parse
          if (this.isGLB) {
            const glbBufferSlice = this.glbBufferSlices;
            const bigBuffer = buffers[0];
            const bufferCount = glbBufferSlice.length;
            buffers.length = bufferCount;
            for (let i = 0; i < bufferCount; i++) {
              const slice = glbBufferSlice[i];
              buffers[i] = bigBuffer.slice(slice.x, slice.x + slice.y);
            }
          }

          const bufferViewCache = new Map<IBufferView, Promise<Uint8Array>>();

          // Restore texture
          Promise.all(
            this.bufferTextures.map((textureRestoreInfo) => {
              const { bufferView } = textureRestoreInfo;
              const texture = textureRestoreInfo.texture;
              return this._getBufferViewData(buffers, bufferView, bufferViewCache).then((bufferData) => {
                if (textureRestoreInfo.mimeType === "image/ktx2") {
                  return KTX2Loader._parseBuffer(bufferData, texture.engine).then(({ result }) => {
                    const { faces } = result;
                    const mipmaps = faces[0];
                    for (let i = 0; i < mipmaps.length; i++) {
                      texture.setPixelBuffer(mipmaps[i].data, i);
                    }
                  });
                } else {
                  return ImageDecoder._decode(bufferData, this.resource.url, textureRestoreInfo.mimeType).then(
                    (image) => {
                      texture.setImageSource(image);
                      texture.generateMipmaps();
                    }
                  );
                }
              });
            })
          )
            .then(() =>
              // Restore mesh
              Promise.all(
                this.meshes.map(async (meshInfo) => {
                  const mesh = meshInfo.mesh;
                  for (const bufferRestoreInfo of meshInfo.vertexBuffers) {
                    const vertexData = await this._getBufferData(buffers, bufferRestoreInfo.data, bufferViewCache);
                    bufferRestoreInfo.buffer.setData(vertexData);
                  }

                  if (meshInfo.indexBuffer) {
                    const indexData = await this._getBufferData(buffers, meshInfo.indexBuffer, bufferViewCache);
                    mesh.setIndices(<Uint8Array | Uint16Array | Uint32Array>indexData);
                  }

                  for (const restoreInfo of meshInfo.blendShapes) {
                    const frame = restoreInfo.blendShape.frames[0];
                    const position = restoreInfo.position;
                    const positionData = await this._getBufferData(buffers, position.buffer, bufferViewCache);
                    frame.deltaPositions = GLTFUtils.bufferToVector3Array(
                      positionData,
                      position.byteOffset,
                      position.count,
                      position.normalized,
                      position.componentType
                    );

                    if (restoreInfo.normal) {
                      const normal = restoreInfo.normal;
                      const normalData = await this._getBufferData(buffers, normal.buffer, bufferViewCache);
                      frame.deltaNormals = GLTFUtils.bufferToVector3Array(
                        normalData,
                        normal.byteOffset,
                        normal.count,
                        normal.normalized,
                        normal.componentType
                      );
                    }

                    if (restoreInfo.tangent) {
                      const tangent = restoreInfo.tangent;
                      const tangentData = await this._getBufferData(buffers, tangent.buffer, bufferViewCache);
                      frame.deltaTangents = GLTFUtils.bufferToVector3Array(
                        tangentData,
                        tangent.byteOffset,
                        tangent.count,
                        tangent.normalized,
                        tangent.componentType
                      );
                    }
                  }
                  mesh.uploadData(true);
                })
              )
            )
            .then(() => {
              resolve(this.resource);
            })
            .catch(reject);
        })
        .catch(reject);
    });
  }

  private _getBufferViewData(
    buffers: ArrayBuffer[],
    bufferView: IBufferView,
    cache: Map<IBufferView, Promise<Uint8Array>>
  ): Promise<Uint8Array> {
    let promise = cache.get(bufferView);
    if (!promise) {
      const meshopt = bufferView.extensions?.EXT_meshopt_compression as IEXTMeshoptCompressionSchema | undefined;
      if (meshopt) {
        const sourceBuffer = buffers[meshopt.buffer];
        const sourceBytes = new Uint8Array(sourceBuffer, meshopt.byteOffset ?? 0, meshopt.byteLength);
        promise = getMeshoptDecoder().then((decoder) =>
          decoder.decodeGltfBuffer(meshopt.count, meshopt.byteStride, sourceBytes, meshopt.mode, meshopt.filter)
        );
      } else {
        const buffer = buffers[bufferView.buffer];
        promise = Promise.resolve(new Uint8Array(buffer, bufferView.byteOffset ?? 0, bufferView.byteLength));
      }
      cache.set(bufferView, promise);
    }
    return promise;
  }

  private async _getBufferData(
    buffers: ArrayBuffer[],
    restoreInfo: BufferDataRestoreInfo,
    bufferViewCache: Map<IBufferView, Promise<Uint8Array>>
  ): Promise<TypedArray> {
    const main = restoreInfo.main;
    let data: TypedArray;
    if (main.bufferView !== undefined) {
      const bufferViewData = await this._getBufferViewData(buffers, main.bufferView, bufferViewCache);
      data = new main.TypedArray(
        bufferViewData.buffer,
        bufferViewData.byteOffset + (main.byteOffset ?? 0),
        main.length
      );
    } else {
      data = new main.TypedArray(main.length);
    }

    const sparseCount = restoreInfo.sparseCount;
    if (sparseCount) {
      if (main.bufferView !== undefined) {
        data = data.slice();
      }
      const sparseIndex = restoreInfo.sparseIndices!;
      const sparseIndexView = await this._getBufferViewData(buffers, sparseIndex.bufferView!, bufferViewCache);
      const sparseIndexData = new sparseIndex.TypedArray(
        sparseIndexView.buffer,
        sparseIndexView.byteOffset + (sparseIndex.byteOffset ?? 0),
        sparseIndex.length
      );

      const sparseValue = restoreInfo.sparseValues!;
      const sparseValueView = await this._getBufferViewData(buffers, sparseValue.bufferView!, bufferViewCache);
      const sparseValueData = new sparseValue.TypedArray(
        sparseValueView.buffer,
        sparseValueView.byteOffset + (sparseValue.byteOffset ?? 0),
        sparseValue.length
      );

      const typeSize = restoreInfo.typeSize!;
      for (let i = 0; i < sparseCount; i++) {
        const replaceIndex = sparseIndexData[i];
        for (let j = 0; j < typeSize; j++) {
          data[replaceIndex * typeSize + j] = sparseValueData[i * typeSize + j];
        }
      }
    }

    return data;
  }
}

/**
 * @internal
 */
export class BufferRequestInfo {
  constructor(
    public url: string,
    public config: RequestConfig
  ) {}
}

/**
 * @internal
 */
export class BufferTextureRestoreInfo {
  constructor(
    public texture: Texture2D,
    public bufferView: IBufferView,
    public mimeType: string
  ) {}
}

/**
 * @internal
 */
export class ModelMeshRestoreInfo {
  public mesh: ModelMesh;
  public vertexBuffers: BufferRestoreInfo[] = [];
  public indexBuffer: BufferDataRestoreInfo;
  public blendShapes: BlendShapeRestoreInfo[] = [];
}

/**
 * @internal
 */
export class BufferRestoreInfo {
  constructor(
    public buffer: Buffer,
    public data: BufferDataRestoreInfo
  ) {}
}

/**
 * @internal
 */
export class BufferDataRestoreInfo {
  constructor(
    public main: RestoreDataAccessor,
    public typeSize?: number,
    public sparseCount?: number,
    public sparseIndices?: RestoreDataAccessor,
    public sparseValues?: RestoreDataAccessor
  ) {}
}

/**
 * @internal
 */
export class RestoreDataAccessor {
  constructor(
    public bufferView: IBufferView | undefined,
    public TypedArray:
      | Uint8ArrayConstructor
      | Int8ArrayConstructor
      | Int16ArrayConstructor
      | Uint16ArrayConstructor
      | Uint32ArrayConstructor
      | Float32ArrayConstructor,
    public byteOffset: number | undefined,
    public length: number
  ) {}
}

/**
 * @internal
 */
export class BlendShapeRestoreInfo {
  constructor(
    public blendShape: BlendShape,
    public position: BlendShapeDataRestoreInfo,
    public normal?: BlendShapeDataRestoreInfo | null,
    public tangent?: BlendShapeDataRestoreInfo | null
  ) {}
}

/**
 * @internal
 */
export class BlendShapeDataRestoreInfo {
  constructor(
    public buffer: BufferDataRestoreInfo,
    public byteOffset: number,
    public count: number,
    public normalized: boolean | undefined,
    public componentType: AccessorComponentType
  ) {}
}
