import {
  BlendShape,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  ModelMesh,
  TypedArray,
  VertexElement
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import {
  BlendShapeDataRestoreInfo,
  BlendShapeRestoreInfo,
  BufferRestoreInfo,
  ModelMeshRestoreInfo
} from "../../GLTFContentRestorer";
import type { IAccessor, IGLTF, IMesh, IMeshPrimitive } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { BufferInfo, GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Mesh)
export class GLTFMeshParser extends GLTFParser {
  private static _tempVector3 = new Vector3();

  /**
   * @internal
   */
  static _parseMeshFromGLTFPrimitive(
    context: GLTFParserContext,
    mesh: ModelMesh,
    meshRestoreInfo: ModelMeshRestoreInfo,
    gltfMesh: IMesh,
    gltfPrimitive: IMeshPrimitive,
    gltf: IGLTF,
    getVertexBufferData: (semantic: string) => TypedArray,
    getBlendShapeData: (semantic: string, shapeIndex: number) => Promise<BufferInfo>,
    getIndexBufferData: () => Promise<TypedArray>,
    keepMeshData: boolean
  ): Promise<ModelMesh> {
    const { accessors } = gltf;
    const { attributes, targets, indices, mode } = gltfPrimitive;
    const engine = mesh.engine;
    const vertexElements = new Array<VertexElement>();

    let vertexCount: number;
    let bufferBindIndex = 0;

    const promises = new Array<Promise<void | void[]>>();
    for (const attribute in attributes) {
      const accessor = accessors[attributes[attribute]];
      const promise = GLTFUtils.getAccessorBuffer(context, gltf.bufferViews, accessor).then((accessorBuffer) => {
        const dataElementSize = GLTFUtils.getAccessorTypeSize(accessor.type);
        const accessorCount = accessor.count;
        const vertices = accessorBuffer.data;

        let vertexElement: VertexElement;
        const meshId = mesh.instanceId;
        const vertexBindingInfos = accessorBuffer.vertexBindingInfos;
        const elementNormalized = accessor.normalized;
        const elementFormat = GLTFUtils.getElementFormat(accessor.componentType, dataElementSize, elementNormalized);

        let scaleFactor: number;
        elementNormalized && (scaleFactor = GLTFUtils.getNormalizedComponentScale(accessor.componentType));

        let elementOffset: number;
        if (accessorBuffer.interleaved) {
          const byteOffset = accessor.byteOffset || 0;
          const stride = accessorBuffer.stride;
          elementOffset = byteOffset % stride;
          if (vertexBindingInfos[meshId] === undefined) {
            vertexElement = new VertexElement(attribute, elementOffset, elementFormat, bufferBindIndex);

            let vertexBuffer = accessorBuffer.vertexBuffer;
            if (!vertexBuffer) {
              vertexBuffer = new Buffer(
                engine,
                BufferBindFlag.VertexBuffer,
                vertices,
                BufferUsage.Static,
                keepMeshData
              );
              accessorBuffer.vertexBuffer = vertexBuffer;
              meshRestoreInfo.vertexBuffers.push(new BufferRestoreInfo(vertexBuffer, accessorBuffer.restoreInfo));
            }
            mesh.setVertexBufferBinding(vertexBuffer, stride, bufferBindIndex);
            vertexBindingInfos[meshId] = bufferBindIndex++;
          } else {
            vertexElement = new VertexElement(attribute, elementOffset, elementFormat, vertexBindingInfos[meshId]);
          }
        } else {
          elementOffset = 0;
          vertexElement = new VertexElement(attribute, elementOffset, elementFormat, bufferBindIndex);

          let vertexBuffer = accessorBuffer.vertexBuffer;
          if (!vertexBuffer) {
            vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static, keepMeshData);
            meshRestoreInfo.vertexBuffers.push(new BufferRestoreInfo(vertexBuffer, accessorBuffer.restoreInfo));
          }
          mesh.setVertexBufferBinding(vertexBuffer, accessorBuffer.stride, bufferBindIndex);
          vertexBindingInfos[meshId] = bufferBindIndex++;
        }
        vertexElements.push(vertexElement);

        if (attribute === "POSITION") {
          vertexCount = accessorCount;

          const { min, max } = mesh.bounds;
          if (accessor.min && accessor.max) {
            min.copyFromArray(accessor.min);
            max.copyFromArray(accessor.max);
          } else {
            const position = GLTFMeshParser._tempVector3;
            min.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
            max.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

            const baseOffset = elementOffset / vertices.BYTES_PER_ELEMENT;
            const stride = vertices.length / accessorCount;
            for (let j = 0; j < accessorCount; j++) {
              const offset = baseOffset + j * stride;
              position.copyFromArray(vertices, offset);
              Vector3.min(min, position, min);
              Vector3.max(max, position, max);
            }
          }
          if (elementNormalized) {
            min.scale(scaleFactor);
            max.scale(scaleFactor);
          }
        }
      });
      promises.push(promise);
    }

    return Promise.all(promises).then(() => {
      mesh.setVertexElements(vertexElements);

      // Indices
      if (indices !== undefined) {
        const indexAccessor = gltf.accessors[indices];
        const promise = GLTFUtils.getAccessorBuffer(context, gltf.bufferViews, indexAccessor).then((accessorBuffer) => {
          mesh.setIndices(<Uint8Array | Uint16Array | Uint32Array>accessorBuffer.data);
          mesh.addSubMesh(0, indexAccessor.count, mode);
          meshRestoreInfo.indexBuffer = accessorBuffer.restoreInfo;
        });
        promises.push(promise);
      } else {
        mesh.addSubMesh(0, vertexCount, mode);
      }

      // BlendShapes
      if (targets) {
        promises.push(
          GLTFMeshParser._createBlendShape(mesh, meshRestoreInfo, gltfMesh, accessors, targets, getBlendShapeData)
        );
      }

      return Promise.all(promises).then(() => {
        mesh.uploadData(!keepMeshData);

        return Promise.resolve(mesh);
      });
    });
  }

  /**
   * @internal
   */
  static _createBlendShape(
    mesh: ModelMesh,
    meshRestoreInfo: ModelMeshRestoreInfo,
    glTFMesh: IMesh,
    accessors: IAccessor[],
    glTFTargets: {
      [name: string]: number;
    }[],
    getBlendShapeData: (semantic: string, shapeIndex: number) => Promise<BufferInfo>
  ): Promise<void[]> {
    const blendShapeNames = glTFMesh.extras ? glTFMesh.extras.targetNames : null;
    let promises = new Array<Promise<void>>();
    for (let i = 0, n = glTFTargets.length; i < n; i++) {
      const name = blendShapeNames ? blendShapeNames[i] : `blendShape${i}`;

      const promise = Promise.all([
        getBlendShapeData("POSITION", i),
        getBlendShapeData("NORMAL", i),
        getBlendShapeData("TANGENT", i)
      ]).then((infos) => {
        const posBufferInfo = infos[0];
        const norBufferInfo = infos[1];
        const tanBufferInfo = infos[2];
        const target = glTFTargets[i];
        let posAccessor: IAccessor;
        let norAccessor: IAccessor;
        let tanAccessor: IAccessor;

        let positions: Vector3[] = null;
        if (posBufferInfo) {
          posAccessor = accessors[target["POSITION"]];
          positions = GLTFUtils.bufferToVector3Array(
            posBufferInfo.data,
            posBufferInfo.stride,
            posAccessor.byteOffset ?? 0,
            posAccessor.count
          );
        }

        let normals: Vector3[] = null;
        if (norBufferInfo) {
          norAccessor = accessors[target["NORMAL"]];
          normals = GLTFUtils.bufferToVector3Array(
            norBufferInfo.data,
            norBufferInfo.stride,
            norAccessor.byteOffset ?? 0,
            norAccessor.count
          );
        }

        let tangents: Vector3[] = null;
        if (tanBufferInfo) {
          tanAccessor = accessors[target["NORMAL"]];
          tangents = GLTFUtils.bufferToVector3Array(
            tanBufferInfo.data,
            tanBufferInfo.stride,
            tanAccessor.byteOffset ?? 0,
            tanAccessor.count
          );
        }

        const blendShape = new BlendShape(name);
        blendShape.addFrame(1.0, positions, normals, tangents);
        mesh.addBlendShape(blendShape);
        meshRestoreInfo.blendShapes.push(
          new BlendShapeRestoreInfo(
            blendShape,
            new BlendShapeDataRestoreInfo(
              posBufferInfo.restoreInfo,
              posBufferInfo.stride,
              posAccessor.byteOffset ?? 0,
              posAccessor.count
            ),
            norBufferInfo
              ? new BlendShapeDataRestoreInfo(
                  norBufferInfo.restoreInfo,
                  norBufferInfo.stride,
                  norAccessor.byteOffset ?? 0,
                  norAccessor.count
                )
              : null,
            tanBufferInfo
              ? new BlendShapeDataRestoreInfo(
                  tanBufferInfo.restoreInfo,
                  tanBufferInfo.stride,
                  tanAccessor.byteOffset ?? 0,
                  tanAccessor.count
                )
              : null
          )
        );
      });
      promises.push(promise);
    }

    return Promise.all(promises);
  }

  parse(context: GLTFParserContext, index: number): Promise<ModelMesh[]> {
    const meshes = context.glTF.meshes;
    if (!meshes) return Promise.resolve(null);

    return this._parseSingleMesh(context, meshes[index]);
  }

  private _parseSingleMesh(context: GLTFParserContext, meshInfo: IMesh): Promise<ModelMesh[]> {
    const {
      glTF,
      glTFResource: { engine }
    } = context;
    const primitivePromises = new Array<Promise<ModelMesh>>();

    for (let i = 0, length = meshInfo.primitives.length; i < length; i++) {
      const gltfPrimitive = meshInfo.primitives[i];

      primitivePromises[i] = new Promise((resolve) => {
        const mesh = <ModelMesh | Promise<ModelMesh>>(
          GLTFParser.executeExtensionsCreateAndParse(gltfPrimitive.extensions, context, gltfPrimitive, meshInfo)
        );

        if (mesh) {
          if (mesh instanceof ModelMesh) {
            resolve(mesh);
          } else {
            mesh.then((mesh) => resolve(mesh));
          }
        } else {
          const mesh = new ModelMesh(engine, meshInfo.name || i + "");

          const meshRestoreInfo = new ModelMeshRestoreInfo();
          meshRestoreInfo.mesh = mesh;
          context.contentRestorer.meshes.push(meshRestoreInfo);

          GLTFMeshParser._parseMeshFromGLTFPrimitive(
            context,
            mesh,
            meshRestoreInfo,
            meshInfo,
            gltfPrimitive,
            glTF,
            (attributeSemantic) => {
              return null;
            },
            (attributeName, shapeIndex) => {
              const shapeAccessorIdx = gltfPrimitive.targets[shapeIndex];
              const attributeAccessorIdx = shapeAccessorIdx[attributeName];
              if (attributeAccessorIdx) {
                const accessor = glTF.accessors[attributeAccessorIdx];
                return GLTFUtils.getAccessorBuffer(context, context.glTF.bufferViews, accessor);
              } else {
                return null;
              }
            },
            () => {
              const indexAccessor = glTF.accessors[gltfPrimitive.indices];
              return context.get<Promise<ArrayBuffer[]>>(GLTFParserType.Buffer).then((buffers) => {
                return GLTFUtils.getAccessorData(glTF, indexAccessor, buffers);
              });
            },
            context.keepMeshData
          ).then(resolve);
        }
      });
    }

    return Promise.all(primitivePromises);
  }
}
