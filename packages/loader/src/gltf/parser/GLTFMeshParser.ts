import {
  AssetPromise,
  BlendShape,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  ModelMesh,
  TypedArray,
  VertexElement
} from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { IGLTF, IMesh, IMeshPrimitive } from "../GLTFSchema";
import { GLTFUtil } from "../GLTFUtil";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFMeshParser extends GLTFParser {
  private static _tempVector3 = new Vector3();

  /**
   * @internal
   */
  static _parseMeshFromGLTFPrimitive(
    context: GLTFParserContext,
    mesh: ModelMesh,
    gltfMesh: IMesh,
    gltfPrimitive: IMeshPrimitive,
    gltf: IGLTF,
    getVertexBufferData: (semantic: string) => TypedArray,
    getBlendShapeData: (semantic: string, shapeIndex: number) => TypedArray,
    getIndexBufferData: () => TypedArray,
    keepMeshData: boolean
  ): Promise<ModelMesh> {
    const { accessors } = gltf;
    const { buffers } = context;
    const { attributes, targets, indices, mode } = gltfPrimitive;

    const engine = mesh.engine;
    const vertexElements = new Array<VertexElement>();

    let vertexCount: number;
    let bufferBindIndex = 0;
    for (const attribute in attributes) {
      const accessor = accessors[attributes[attribute]];
      const accessorBuffer = GLTFUtil.getAccessorBuffer(context, gltf, accessor);

      const dataElmentSize = GLTFUtil.getAccessorTypeSize(accessor.type);
      const attributeCount = accessor.count;
      const vertices = accessorBuffer.data;

      let vertexElement: VertexElement;
      const meshId = mesh.instanceId;
      const vertexBindingInfos = accessorBuffer.vertexBindingInfos;
      const elementFormat = GLTFUtil.getElementFormat(accessor.componentType, dataElmentSize, accessor.normalized);
      if (accessorBuffer.interleaved) {
        const byteOffset = accessor.byteOffset || 0;
        const stride = accessorBuffer.stride;
        const elementOffset = byteOffset % stride;

        if (vertexBindingInfos[meshId] === undefined) {
          vertexElement = new VertexElement(attribute, elementOffset, elementFormat, bufferBindIndex);

          let vertexBuffer = accessorBuffer.vertxBuffer;
          if (!vertexBuffer) {
            vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices.byteLength, BufferUsage.Static);
            vertexBuffer.setData(vertices);
            accessorBuffer.vertxBuffer = vertexBuffer;
          }
          mesh.setVertexBufferBinding(vertexBuffer, stride, bufferBindIndex);
          vertexBindingInfos[meshId] = bufferBindIndex++;
        } else {
          vertexElement = new VertexElement(attribute, elementOffset, elementFormat, vertexBindingInfos[meshId]);
        }
      } else {
        vertexElement = new VertexElement(attribute, 0, elementFormat, bufferBindIndex);

        const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices.byteLength, BufferUsage.Static);
        vertexBuffer.setData(vertices);
        mesh.setVertexBufferBinding(vertexBuffer, accessorBuffer.stride, bufferBindIndex);
        vertexBindingInfos[meshId] = bufferBindIndex++;
      }
      vertexElements.push(vertexElement);

      if (attribute === "POSITION") {
        vertexCount = attributeCount;
        const { min, max } = mesh.bounds;
        if (accessor.min && accessor.max) {
          min.copyFromArray(accessor.min);
          max.copyFromArray(accessor.max);
        } else {
          const position = GLTFMeshParser._tempVector3;
          min.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
          max.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

          const stride = vertices.length / attributeCount;
          for (let j = 0; j < attributeCount; j++) {
            const offset = j * stride;
            position.copyFromArray(vertices, offset);
            Vector3.min(min, position, min);
            Vector3.max(max, position, max);
          }
        }

        if (accessor.normalized) {
          const sacleFactor = GLTFUtil.getNormalizedComponentScale(accessor.componentType);
          min.scale(sacleFactor);
          max.scale(sacleFactor);
        }
      }
    }
    mesh.setVertexElements(vertexElements);

    // Indices
    if (indices !== undefined) {
      const indexAccessor = gltf.accessors[indices];
      const indexData = getIndexBufferData();
      mesh.setIndices(<Uint8Array | Uint16Array | Uint32Array>indexData);
      mesh.addSubMesh(0, indexAccessor.count, mode);
    } else {
      mesh.addSubMesh(0, vertexCount, mode);
    }

    // BlendShapes
    targets && GLTFMeshParser._createBlendShape(mesh, gltfMesh, targets, getBlendShapeData);

    mesh.uploadData(!keepMeshData);
    return Promise.resolve(mesh);
  }

  /**
   * @internal
   */
  static _createBlendShape(
    mesh: ModelMesh,
    glTFMesh: IMesh,
    glTFTargets: {
      [name: string]: number;
    }[],
    getBlendShapeData: (semantic: string, shapeIndex: number) => TypedArray
  ): void {
    const blendShapeNames = glTFMesh.extras ? glTFMesh.extras.targetNames : null;

    for (let i = 0, n = glTFTargets.length; i < n; i++) {
      const name = blendShapeNames ? blendShapeNames[i] : `blendShape${i}`;
      const deltaPosBuffer = getBlendShapeData("POSITION", i);
      const deltaNorBuffer = getBlendShapeData("NORMAL", i);
      const deltaTanBuffer = getBlendShapeData("TANGENT", i);
      const deltaPositions = deltaPosBuffer ? GLTFUtil.floatBufferToVector3Array(<Float32Array>deltaPosBuffer) : null;
      const deltaNormals = deltaNorBuffer ? GLTFUtil.floatBufferToVector3Array(<Float32Array>deltaNorBuffer) : null;
      const deltaTangents = deltaTanBuffer ? GLTFUtil.floatBufferToVector3Array(<Float32Array>deltaTanBuffer) : null;

      const blendShape = new BlendShape(name);
      blendShape.addFrame(1.0, deltaPositions, deltaNormals, deltaTangents);
      mesh.addBlendShape(blendShape);
    }
  }

  parse(context: GLTFParserContext) {
    const { gltf, buffers, glTFResource } = context;
    const { engine } = glTFResource;
    if (!gltf.meshes) return;

    const meshesPromiseInfo = context.meshesPromiseInfo;
    const meshPromises: Promise<ModelMesh[]>[] = [];

    for (let i = 0; i < gltf.meshes.length; i++) {
      const gltfMesh = gltf.meshes[i];
      const primitivePromises: Promise<ModelMesh>[] = [];

      for (let j = 0; j < gltfMesh.primitives.length; j++) {
        const gltfPrimitive = gltfMesh.primitives[j];

        primitivePromises[j] = new Promise((resolve) => {
          const mesh = <ModelMesh | Promise<ModelMesh>>(
            GLTFParser.executeExtensionsCreateAndParse(gltfPrimitive.extensions, context, gltfPrimitive, gltfMesh)
          );

          if (mesh) {
            if (mesh instanceof ModelMesh) {
              resolve(mesh);
            } else {
              mesh.then((mesh) => resolve(mesh));
            }
          } else {
            const mesh = new ModelMesh(engine, gltfMesh.name || j + "");
            GLTFMeshParser._parseMeshFromGLTFPrimitive(
              context,
              mesh,
              gltfMesh,
              gltfPrimitive,
              gltf,
              (attributeSemantic) => {
                return null;
              },
              (attributeName, shapeIndex) => {
                const shapeAccessorIdx = gltfPrimitive.targets[shapeIndex];
                const attributeAccessorIdx = shapeAccessorIdx[attributeName];
                if (attributeAccessorIdx) {
                  const accessor = gltf.accessors[attributeAccessorIdx];
                  return GLTFUtil.getAccessorData(gltf, accessor, buffers);
                } else {
                  return null;
                }
              },
              () => {
                const indexAccessor = gltf.accessors[gltfPrimitive.indices];
                return GLTFUtil.getAccessorData(gltf, indexAccessor, buffers);
              },
              context.keepMeshData
            ).then(resolve);
          }
        });
      }

      meshPromises[i] = Promise.all(primitivePromises);
    }

    AssetPromise.all(meshPromises)
      .then((meshes: ModelMesh[][]) => {
        glTFResource.meshes = meshes;
        meshesPromiseInfo.resolve(meshes);
      })
      .catch(meshesPromiseInfo.reject);

    return meshesPromiseInfo.promise;
  }
}
