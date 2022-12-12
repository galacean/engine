import {
  BlendShape,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  EngineObject,
  ModelMesh,
  TypedArray,
  VertexElement
} from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { GLTFUtil } from "../GLTFUtil";
import { IGLTF, IMesh, IMeshPrimitive } from "../Schema";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class MeshParser extends Parser {
  private static _tempVector3 = new Vector3();

  parse(context: ParserContext) {
    const { meshIndex, subMeshIndex, glTFResource } = context;
    const { engine, gltf, buffers } = glTFResource;
    if (!gltf.meshes) return;

    const meshPromises: Promise<ModelMesh[]>[] = [];

    for (let i = 0; i < gltf.meshes.length; i++) {
      if (meshIndex >= 0 && meshIndex !== i) {
        continue;
      }
      const gltfMesh = gltf.meshes[i];
      const primitivePromises: Promise<ModelMesh>[] = [];

      for (let j = 0; j < gltfMesh.primitives.length; j++) {
        if (subMeshIndex >= 0 && subMeshIndex !== j) {
          continue;
        }

        const gltfPrimitive = gltfMesh.primitives[j];
        const { extensions = {} } = gltfPrimitive;
        const { KHR_draco_mesh_compression } = extensions;

        primitivePromises[j] = new Promise((resolve) => {
          const mesh = new ModelMesh(engine, gltfMesh.name || j + "");

          if (KHR_draco_mesh_compression) {
            (<Promise<EngineObject>>(
              Parser.createEngineResource(
                "KHR_draco_mesh_compression",
                KHR_draco_mesh_compression,
                glTFResource,
                gltfPrimitive
              )
            ))
              .then((decodedGeometry: any) => {
                return this._parseMeshFromGLTFPrimitive(
                  context,
                  mesh,
                  gltfMesh,
                  gltfPrimitive,
                  gltf,
                  (attributeSemantic) => {
                    for (let j = 0; j < decodedGeometry.attributes.length; j++) {
                      if (decodedGeometry.attributes[j].name === attributeSemantic) {
                        return decodedGeometry.attributes[j].array;
                      }
                    }
                    return null;
                  },
                  (attributeSemantic, shapeIndex) => {
                    throw "BlendShape animation is not supported when using draco.";
                  },
                  () => {
                    return decodedGeometry.index.array;
                  },
                  context.keepMeshData
                );
              })
              .then(resolve);
          } else {
            this._parseMeshFromGLTFPrimitive(
              context,
              mesh,
              gltfMesh,
              gltfPrimitive,
              gltf,
              (attributeSemantic) => {
                const accessorIdx = gltfPrimitive.attributes[attributeSemantic];
                const accessor = gltf.accessors[accessorIdx];
                return GLTFUtil.getVertexAccessorData(gltf, accessor, buffers);
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

    return Promise.all(meshPromises).then((meshes: ModelMesh[][]) => {
      if (meshIndex >= 0) {
        const mesh = meshes[meshIndex]?.[subMeshIndex];
        if (mesh) {
          return mesh;
        } else {
          throw `meshIndex-subMeshIndex index not find in: ${meshIndex}-${subMeshIndex}`;
        }
      }
      glTFResource.meshes = meshes;
    });
  }

  private _parseMeshFromGLTFPrimitive(
    context: ParserContext,
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
    const { buffers } = context.glTFResource;
    const { attributes, targets, indices, mode } = gltfPrimitive;

    const engine = mesh.engine;
    const vertexElements = new Array<VertexElement>();
    const bufferViews = gltf.bufferViews;

    let vertexCount: number;
    let bufferBindIndex = 0;
    for (const attribute in attributes) {
      const accessor = accessors[attributes[attribute]];
      const componentType = accessor.componentType;
      const bufferView = bufferViews[accessor.bufferView];

      const buffer = buffers[bufferView.buffer];
      const bufferByteOffset = bufferView.byteOffset || 0;
      const bufferStride = bufferView.byteStride;
      const byteOffset = accessor.byteOffset || 0;

      const TypedArray = GLTFUtil.getComponentType(componentType);
      const dataElmentSize = GLTFUtil.getAccessorTypeSize(accessor.type);
      const dataElementBytes = TypedArray.BYTES_PER_ELEMENT;
      const elementStride = dataElmentSize * dataElementBytes;
      const attributeCount = accessor.count;

      let vertexElement: VertexElement;
      let vertices: TypedArray;
      const elementFormat = GLTFUtil.getElementFormat(componentType, dataElmentSize, accessor.normalized);
      if (bufferStride && bufferStride !== elementStride) {
        const bufferSlice = Math.floor(byteOffset / bufferStride);
        const bufferCacheKey = accessor.bufferView + ":" + componentType + ":" + bufferSlice + ":" + attributeCount;
        const cacheBuffer = context.vertexBufferCache[bufferCacheKey];

        const elementOffset = byteOffset % bufferStride;
        if (!cacheBuffer) {
          vertexElement = new VertexElement(attribute, elementOffset, elementFormat, bufferBindIndex);

          const offset = bufferByteOffset + bufferSlice * bufferStride;
          const count = attributeCount * (bufferStride / dataElementBytes);
          vertices = new TypedArray(buffer, offset, count);

          const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices.byteLength, BufferUsage.Static);
          vertexBuffer.setData(vertices);
          mesh.setVertexBufferBinding(vertexBuffer, bufferStride, bufferBindIndex);

          context.vertexBufferCache[bufferCacheKey] = { bindIndex: bufferBindIndex++, buffer: vertexBuffer };
        } else {
          vertexElement = new VertexElement(attribute, elementOffset, elementFormat, cacheBuffer.bindIndex);
        }
      } else {
        vertexElement = new VertexElement(attribute, 0, elementFormat, bufferBindIndex);
        const offset = bufferByteOffset + byteOffset;
        const count = attributeCount * dataElmentSize;
        vertices = new TypedArray(buffer, offset, count);

        const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices.byteLength, BufferUsage.Static);
        vertexBuffer.setData(vertices);
        mesh.setVertexBufferBinding(vertexBuffer, elementStride, bufferBindIndex++);
      }
      vertexElements.push(vertexElement);

      if (accessor.sparse) {
        throw "error";
      }

      if (attribute === "POSITION") {
        const { min, max } = mesh.bounds;
        if (accessor.min && accessor.max) {
          min.copyFromArray(accessor.min);
          max.copyFromArray(accessor.max);
        } else {
          const position = MeshParser._tempVector3;
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
    targets && this._createBlendShape(mesh, gltfMesh, targets, getBlendShapeData);

    mesh.uploadData(!keepMeshData);
    return Promise.resolve(mesh);
  }

  private _createBlendShape(
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
}
