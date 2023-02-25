import {
  AssetPromise,
  AssetType,
  BlendShape,
  Buffer,
  ContentRestorer,
  Loader,
  LoadItem,
  ModelMesh,
  request,
  resourceLoader,
  ResourceManager,
  Texture2D
} from "@oasis-engine/core";
import { RequestConfig } from "@oasis-engine/core/types/asset/request";
import { Vector2 } from "@oasis-engine/math";
import { GLTFParser } from "./gltf/GLTFParser";
import { GLTFResource } from "./gltf/GLTFResource";
import { GLTFUtil } from "./gltf/GLTFUtil";
import { ParserContext } from "./gltf/parser/ParserContext";
import { IBufferView } from "./gltf/Schema";

@resourceLoader(AssetType.Prefab, ["gltf", "glb"])
export class GLTFLoader extends Loader<GLTFResource> {
  /**
   * @override
   */
  load(item: LoadItem, resourceManager: ResourceManager): Record<string, AssetPromise<any>> {
    const url = item.url;
    const context = new ParserContext(url);
    const glTFResource = new GLTFResource(resourceManager.engine, url);
    const restorer = new GLTFContentRestorer(glTFResource);
    context.contentRestorer = restorer;

    const masterPromiseInfo = context.masterPromiseInfo;

    context.glTFResource = glTFResource;
    context.keepMeshData = item.params?.keepMeshData ?? false;

    masterPromiseInfo.onCancel(() => {
      const { chainPromises } = context;
      for (const promise of chainPromises) {
        promise.cancel();
      }
    });

    GLTFParser.defaultPipeline
      .parse(context)
      .then((glTFResource) => {
        resourceManager.addContentRestorer(restorer);
        masterPromiseInfo.resolve(glTFResource);
      })
      .catch((e) => {
        console.error(e);
        masterPromiseInfo.reject(`Error loading glTF model from ${url} .`);
      });

    return context.promiseMap;
  }
}

/**
 * GlTF loader params.
 */
export interface GLTFParams {
  /** Keep raw mesh data for glTF parser, default is false. */
  keepMeshData: boolean;
}

/**
 * @internal
 */
export class GLTFContentRestorer extends ContentRestorer<GLTFResource> {
  isGLB: boolean;
  bufferRequests: BufferRequestInfo[] = [];
  glbBufferSlices: Vector2[] = [];
  bufferTextures: BufferTextureRestoreInfo[] = [];
  meshes: ModelMeshRestoreInfo[] = [];

  /**
   * @override
   */
  restoreContent(): AssetPromise<GLTFResource> {
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

              return GLTFUtil.loadImageBuffer(bufferData, textureRestoreInfo.mimeType).then((image) => {
                textureRestoreInfo.texture.setImageSource(image);
                textureRestoreInfo.texture.generateMipmaps();
              });
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

                const { indexBuffer } = meshInfo;
                if (indexBuffer) {
                  const indexData = this._getBufferData(buffers, indexBuffer);
                  mesh.setIndices(<Uint8Array | Uint16Array | Uint32Array>indexData);
                }

                for (const restoreInfo of meshInfo.blendShapes) {
                  const { position, normal, tangent } = restoreInfo;

                  const positionData = this._getBufferData(buffers, position);
                  const positions = GLTFUtil.floatBufferToVector3Array(<Float32Array>positionData);
                  restoreInfo.blendShape.frames[0].deltaPositions = positions;

                  if (normal) {
                    const normalData = this._getBufferData(buffers, normal);
                    const normals = GLTFUtil.floatBufferToVector3Array(<Float32Array>normalData);
                    restoreInfo.blendShape.frames[0].deltaNormals = normals;
                  }

                  if (tangent) {
                    const tangentData = this._getBufferData(buffers, tangent);
                    const tangents = GLTFUtil.floatBufferToVector3Array(<Float32Array>tangentData);
                    restoreInfo.blendShape.frames[0].deltaTangents = tangents;
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

  private _getBufferData(buffers: ArrayBuffer[], restoreInfo: BufferDataRestoreInfo): ArrayBufferView {
    const main = restoreInfo.main;
    const buffer = buffers[main.bufferIndex];
    const data = new main.TypedArray(buffer, main.byteOffset, main.length);

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
  constructor(public url: string, public config: RequestConfig) {}
}

/**
 * @internal
 */
export class BufferTextureRestoreInfo {
  public texture: Texture2D;
  public bufferView: IBufferView;
  public mimeType: string;
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
  constructor(public buffer: Buffer, public data: BufferDataRestoreInfo) {}
}

/**
 * @internal
 */
export class BufferDataRestoreInfo {
  constructor(
    public main: BufferRestoreAccessor,
    public typeSize?: number,
    public sparseCount?: number,
    public sparseIndices?: BufferRestoreAccessor,
    public sparseValues?: BufferRestoreAccessor
  ) {}
}

/**
 * @internal
 */
export class BufferRestoreAccessor {
  constructor(
    public bufferIndex: number,
    public TypedArray: new (buffer: ArrayBuffer, byteOffset: number, length?: number) => ArrayBufferView,
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
    public position: BufferDataRestoreInfo,
    public normal?: BufferDataRestoreInfo,
    public tangent?: BufferDataRestoreInfo
  ) {}
}
