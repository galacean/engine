import {
  AssetPromise,
  AssetType,
  BlendShape,
  Buffer,
  ContentRestoreInfo,
  Loader,
  LoadItem,
  ModelMesh,
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
        this.addContentRestoreInfo(glTFResource, context.contentRestoreInfo);
        masterPromiseInfo.resolve(glTFResource);
      })
      .catch((e) => {
        console.error(e);
        masterPromiseInfo.reject(`Error loading glTF model from ${url} .`);
      });

    return context.promiseMap;
  }

  /**
   * @override
   */
  restoreContent(host: GLTFResource, restoreInfo: GLTFContentRestoreInfo): AssetPromise<GLTFResource> {
    return new AssetPromise((resolve, reject) => {
      Promise.all(
        restoreInfo.bufferRequests.map((bufferRequestInfo) => {
          return this.request<ArrayBuffer>(bufferRequestInfo.url, bufferRequestInfo.config);
        })
      )
        .then((buffers: ArrayBuffer[]) => {
          // Buffer parse
          if (restoreInfo.isGLB) {
            const glbBufferSlice = restoreInfo.glbBufferSlices;
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
            restoreInfo.bufferTextures.map((textureRestoreInfo) => {
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
              for (const meshInfo of restoreInfo.meshes) {
                for (const restoreInfo of meshInfo.vertexBuffers) {
                  const buffer = buffers[restoreInfo.bufferIndex];
                  const byteOffset = restoreInfo.byteOffset;
                  const data = new restoreInfo.TypedArray(buffer, byteOffset, restoreInfo.length);
                  restoreInfo.buffer.setData(data);
                }

                const restoreInfo = meshInfo.indexBuffer;
                const buffer = buffers[restoreInfo.bufferIndex];
                const byteOffset = restoreInfo.byteOffset;
                const data = new restoreInfo.TypedArray(buffer, byteOffset, restoreInfo.length);
                restoreInfo.buffer.setData(data);

                for (const restoreInfo of meshInfo.blendShapes) {
                  const { position, normal, tangent } = restoreInfo;
                  const buffer = buffers[position.bufferIndex];
                  const byteOffset = position.byteOffset;
                  const positionData = new position.TypedArray(buffer, byteOffset, position.length);
                  const positions = GLTFUtil.floatBufferToVector3Array(<Float32Array>positionData);
                  restoreInfo.blendShape.frames[0].deltaPositions = positions;

                  if (normal) {
                    const buffer = buffers[normal.bufferIndex];
                    const byteOffset = normal.byteOffset;
                    const normalData = new normal.TypedArray(buffer, byteOffset, normal.length);
                    const normals = GLTFUtil.floatBufferToVector3Array(<Float32Array>normalData);
                    restoreInfo.blendShape.frames[0].deltaNormals = normals;
                  }

                  if (tangent) {
                    const buffer = buffers[tangent.bufferIndex];
                    const byteOffset = tangent.byteOffset;
                    const tangentData = new tangent.TypedArray(buffer, byteOffset, tangent.length);
                    const tangents = GLTFUtil.floatBufferToVector3Array(<Float32Array>tangentData);
                    restoreInfo.blendShape.frames[0].deltaTangents = tangents;
                  }
                }
                meshInfo.mesh.uploadData(true);
              }
              resolve(host);
            })
            .catch(reject);
        })
        .catch(reject);
    });
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
export class GLTFContentRestoreInfo extends ContentRestoreInfo {
  isGLB: boolean;
  bufferRequests: BufferRequestInfo[] = [];
  glbBufferSlices: Vector2[] = [];
  bufferTextures: BufferTextureRestoreInfo[] = [];
  meshes: ModelMeshRestoreInfo[] = [];
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
  public indexBuffer: BufferRestoreInfo;
  public blendShapes: BlendShapeRestoreInfo[] = [];
}

/**
 * @internal
 */
export class BufferRestoreInfo {
  buffer: Buffer;
  bufferIndex: number;
  TypedArray: any;
  byteOffset: number;
  length: number;
  setRestoreInfo(bufferIndex: number, TypedArray: any, byteOffset: number, length: number) {
    this.bufferIndex = bufferIndex;
    this.TypedArray = TypedArray;
    this.byteOffset = byteOffset;
    this.length = length;
  }
}

/**
 * @internal
 */
export class BlendShapeRestoreInfo {
  constructor(
    public blendShape: BlendShape,
    public position: BufferRestoreInfo,
    public normal?: BufferRestoreInfo,
    public tangent?: BufferRestoreInfo
  ) {}
}
