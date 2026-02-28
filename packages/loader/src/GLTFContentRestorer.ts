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
          return request<ArrayBuffer>(bufferRequestInfo.url, bufferRequestInfo.config);
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

          // Restore texture
          AssetPromise.all(
            this.bufferTextures.map((textureRestoreInfo) => {
              const { bufferView } = textureRestoreInfo;
              const buffer = buffers[bufferView.buffer];
              const bufferData = new Uint8Array(buffer, bufferView.byteOffset ?? 0, bufferView.byteLength);
              const texture = textureRestoreInfo.texture;
              if (textureRestoreInfo.mimeType === "image/ktx2") {
                return KTX2Loader._parseBuffer(bufferData, texture.engine).then(({ result }) => {
                  const { faces } = result;
                  const mipmaps = faces[0];
                  for (let i = 0; i < mipmaps.length; i++) {
                    texture.setPixelBuffer(mipmaps[i].data, i);
                  }
                });
              } else {
                return GLTFUtils.loadImageBuffer(bufferData, textureRestoreInfo.mimeType).then((image) => {
                  texture.setImageSource(image);
                  texture.generateMipmaps();
                });
              }
            })
          )
            .then(() => {
              // Restore mesh
              for (const meshInfo of this.meshes) {
                const mesh = meshInfo.mesh;
                for (const bufferRestoreInfo of meshInfo.vertexBuffers) {
                  const vertexData = this._getBufferData(buffers, bufferRestoreInfo.data);
                  bufferRestoreInfo.buffer.setData(vertexData);
                }

                if (meshInfo.indexBuffer) {
                  const indexData = this._getBufferData(buffers, meshInfo.indexBuffer);
                  mesh.setIndices(<Uint8Array | Uint16Array | Uint32Array>indexData);
                }

                for (const restoreInfo of meshInfo.blendShapes) {
                  const frame = restoreInfo.blendShape.frames[0];
                  const position = restoreInfo.position;
                  const positionData = this._getBufferData(buffers, position.buffer);
                  frame.deltaPositions = GLTFUtils.bufferToVector3Array(
                    positionData,
                    position.byteOffset,
                    position.count,
                    position.normalized,
                    position.componentType
                  );

                  if (restoreInfo.normal) {
                    const normal = restoreInfo.normal;
                    const normalData = this._getBufferData(buffers, normal.buffer);
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
                    const tangentData = this._getBufferData(buffers, tangent.buffer);
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
              }
              resolve(this.resource);
            })
            .catch(reject);
        })
        .catch(reject);
    });
  }

  private _getBufferData(buffers: ArrayBuffer[], restoreInfo: BufferDataRestoreInfo): TypedArray {
    const main = restoreInfo.main;
    let data: TypedArray;
    if (main) {
      const buffer = buffers[main.bufferIndex];
      data = new main.TypedArray(buffer, main.byteOffset, main.length);
    } else {
      data = new main.TypedArray(main.length);
    }

    const sparseCount = restoreInfo.sparseCount;
    if (sparseCount) {
      const sparseIndex = restoreInfo.sparseIndices;
      const sparseIndexBuffer = buffers[sparseIndex.bufferIndex];
      const sparseIndexData = new sparseIndex.TypedArray(sparseIndexBuffer, sparseIndex.byteOffset, sparseIndex.length);

      const sparseValue = restoreInfo.sparseValues;
      const sparseValueBuffer = buffers[sparseValue.bufferIndex];
      const sparseValueData = new sparseValue.TypedArray(sparseValueBuffer, sparseValue.byteOffset, sparseValue.length);

      const typeSize = restoreInfo.typeSize;
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
    public bufferIndex: number,
    public TypedArray:
      | Uint8ArrayConstructor
      | Int8ArrayConstructor
      | Int16ArrayConstructor
      | Uint16ArrayConstructor
      | Uint32ArrayConstructor
      | Float32ArrayConstructor,
    public byteOffset: number,
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
    public normal?: BlendShapeDataRestoreInfo,
    public tangent?: BlendShapeDataRestoreInfo
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
    public normalized: boolean,
    public componentType: AccessorComponentType
  ) {}
}
