import { BlendShape, Buffer, BufferBindFlag, BufferUsage, ModelMesh, VertexElement } from "@galacean/engine-core";
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
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

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
    keepMeshData: boolean
  ): Promise<ModelMesh> {
    const { accessors } = gltf;
    const { attributes, targets, indices, mode } = gltfPrimitive;
    const engine = mesh.engine;
    const vertexElements = new Array<VertexElement>();

    let vertexCount: number;
    let bufferBindIndex = 0;

    const promises = new Array<Promise<void>>();
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
          GLTFMeshParser._createBlendShape(
            context,
            mesh,
            meshRestoreInfo,
            gltfMesh,
            gltfPrimitive,
            targets,
            this._getBlendShapeData
          )
        );
      }

      return Promise.all(promises).then(() => {
        mesh.uploadData(!keepMeshData);
        return mesh;
      });
    });
  }

  private static _getBlendShapeData(
    context: GLTFParserContext,
    glTF: IGLTF,
    accessor: IAccessor
  ): Promise<{ vertices: Vector3[]; restoreInfo: BlendShapeDataRestoreInfo }> {
    return GLTFUtils.getAccessorBuffer(context, glTF.bufferViews, accessor).then((bufferInfo) => {
      const buffer = bufferInfo.data;
      const byteOffset = bufferInfo.interleaved ? (accessor.byteOffset ?? 0) % bufferInfo.stride : 0;
      const { count, normalized, componentType } = accessor;
      const vertices = GLTFUtils.bufferToVector3Array(buffer, byteOffset, count, normalized, componentType);

      const restoreInfo = new BlendShapeDataRestoreInfo(
        bufferInfo.restoreInfo,
        byteOffset,
        count,
        normalized,
        componentType
      );

      return { vertices, restoreInfo };
    });
  }

  /**
   * @internal
   */
  static _createBlendShape(
    context: GLTFParserContext,
    mesh: ModelMesh,
    meshRestoreInfo: ModelMeshRestoreInfo,
    glTFMesh: IMesh,
    gltfPrimitive: IMeshPrimitive,
    glTFTargets: {
      [name: string]: number;
    }[],
    getBlendShapeData: (
      context: GLTFParserContext,
      glTF: IGLTF,
      accessor: IAccessor
    ) => Promise<{ vertices: Vector3[]; restoreInfo: BlendShapeDataRestoreInfo }>
  ): Promise<void> {
    const glTF = context.glTF;
    const accessors = glTF.accessors;
    const blendShapeNames = glTFMesh.extras ? glTFMesh.extras.targetNames : null;
    let promises = new Array<Promise<void>>();

    const blendShapeCount = glTFTargets.length;
    const blendShapeCollection = new Array<BlendShapeData>(blendShapeCount);
    for (let i = 0; i < blendShapeCount; i++) {
      const blendShapeData = <BlendShapeData>{};
      blendShapeCollection[i] = blendShapeData;

      const name = blendShapeNames ? blendShapeNames[i] : `blendShape${i}`;

      const targets = gltfPrimitive.targets[i];
      const normalTarget = targets["NORMAL"];
      const tangentTarget = targets["TANGENT"];
      const hasNormal = normalTarget !== undefined;
      const hasTangent = tangentTarget !== undefined;

      const promise = Promise.all([
        getBlendShapeData(context, glTF, accessors[targets["POSITION"]]),
        hasNormal ? getBlendShapeData(context, glTF, accessors[normalTarget]) : null,
        hasTangent ? getBlendShapeData(context, glTF, accessors[tangentTarget]) : null
      ]).then((vertices) => {
        const [positionData, normalData, tangentData] = vertices;

        const blendShape = new BlendShape(name);
        blendShape.addFrame(
          1.0,
          positionData.vertices,
          hasNormal ? normalData.vertices : null,
          hasTangent ? tangentData.vertices : null
        );
        blendShapeData.blendShape = blendShape;

        blendShapeData.restoreInfo = new BlendShapeRestoreInfo(
          blendShape,
          positionData.restoreInfo,
          hasNormal ? normalData.restoreInfo : null,
          hasTangent ? tangentData?.restoreInfo : null
        );
      });
      promises.push(promise);
    }

    return Promise.all(promises).then(() => {
      for (const blendShape of blendShapeCollection) {
        mesh.addBlendShape(blendShape.blendShape);
        meshRestoreInfo.blendShapes.push(blendShape.restoreInfo);
      }
    });
  }

  parse(context: GLTFParserContext, index: number): Promise<ModelMesh[]> {
    const meshInfo = context.glTF.meshes[index];

    const { glTF, glTFResource } = context;
    const engine = glTFResource.engine;
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
            mesh.then((mesh) => {
              resolve(mesh);
            });
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
            context.params.keepMeshData
          ).then(resolve);
        }
      });
    }

    return Promise.all(primitivePromises);
  }
}

interface BlendShapeData {
  blendShape: BlendShape;
  restoreInfo: BlendShapeRestoreInfo;
}
