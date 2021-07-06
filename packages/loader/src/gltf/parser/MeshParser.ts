import {
  BlendShape,
  BlendShapeFrame,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Engine,
  EngineObject,
  IndexBufferBinding,
  IndexFormat,
  ModelMesh,
  TypedArray,
  VertexElement
} from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { GLTFUtil } from "../GLTFUtil";
import { IGLTF, IMesh, IMeshPrimitive, INode } from "../Schema";
import { Parser } from "./Parser";

export class MeshParser extends Parser {
  private static _tempVector3 = new Vector3();
  parse(context: GLTFResource): Promise<void> {
    const { engine, gltf, buffers } = context;
    if (!gltf.meshes) return;

    const meshPromises: Promise<BufferMesh[]>[] = [];

    for (let i = 0; i < gltf.meshes.length; i++) {
      const gltfMesh = gltf.meshes[i];
      const primitivePromises: Promise<BufferMesh>[] = [];

      for (let j = 0; j < gltfMesh.primitives.length; j++) {
        const gltfPrimitive = gltfMesh.primitives[j];
        const { extensions = {} } = gltfPrimitive;
        const { KHR_draco_mesh_compression } = extensions;

        primitivePromises.push(
          new Promise((resolve) => {
            const mesh = new BufferMesh(engine, gltfMesh.name || j + "");

            if (KHR_draco_mesh_compression) {
              (<Promise<EngineObject>>(
                Parser.createEngineResource(
                  "KHR_draco_mesh_compression",
                  KHR_draco_mesh_compression,
                  context,
                  gltfPrimitive
                )
              ))
                .then((decodedGeometry: any) => {
                  return this._parseMeshFromGLTFPrimitive(
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
                    (attributeSemantic) => {
                      for (let j = 0; j < decodedGeometry.targets.length; j++) {
                        if (decodedGeometry.targets[j].name === attributeSemantic) {
                          return decodedGeometry.targets[j].array;
                        }
                      }
                      return null;
                    },
                    () => {
                      return decodedGeometry.index.array;
                    },
                    engine
                  );
                })
                .then(resolve);
            } else {
              this._parseMeshFromGLTFPrimitive(
                mesh,
                gltfMesh,
                gltfPrimitive,
                gltf,
                (attributeSemantic) => {
                  const accessorIdx = gltfPrimitive.attributes[attributeSemantic];
                  const accessor = gltf.accessors[accessorIdx];
                  return GLTFUtil.getAccessorData(gltf, accessor, buffers);
                },
                (attributeName, shapeIndex) => {
                  const shapeAccessorIdx = gltfPrimitive.targets[shapeIndex];
                  const attributeAccessorIdx = shapeAccessorIdx[attributeName];
                  if (attributeAccessorIdx) {
                    const accessor = gltf.accessors[attributeAccessorIdx];
                    console.log(accessor.name);
                    return GLTFUtil.getAccessorData(gltf, accessor, buffers);
                  } else {
                    return null;
                  }
                },
                () => {
                  const indexAccessor = gltf.accessors[gltfPrimitive.indices];
                  return GLTFUtil.getAccessorData(gltf, indexAccessor, buffers);
                },
                engine
              ).then(resolve);
            }
          })
        );
      }

      meshPromises.push(Promise.all(primitivePromises));
    }

    return Promise.all(meshPromises).then((meshes: BufferMesh[][]) => {
      context.meshes = meshes;
    });
  }

  private _parseMeshFromGLTFPrimitive(
    mesh: BufferMesh,
    gltfMesh: IMesh,
    gltfPrimitive: IMeshPrimitive,
    gltf: IGLTF,
    getVertexBufferData: (semantic: string) => TypedArray,
    getBlendShapeData: (semantic: string, shapeIndex: number) => TypedArray,
    getIndexBufferData: () => TypedArray,
    engine: Engine
  ): Promise<BufferMesh> {
    const { attributes, targets, indices, mode } = gltfPrimitive;
    const vertexElements: VertexElement[] = [];
    let j = 0;
    let vertexCount: number;
    for (const attributeSemantic in attributes) {
      const accessorIdx = attributes[attributeSemantic];
      const accessor = gltf.accessors[accessorIdx];
      const stride = GLTFUtil.getVertexStride(gltf, accessor);
      const vertexELement = GLTFUtil.createVertexElement(attributeSemantic, accessor, j);

      vertexElements.push(vertexELement);
      const bufferData = getVertexBufferData(attributeSemantic);
      const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, bufferData.byteLength, BufferUsage.Static);
      vertexBuffer.setData(bufferData);
      mesh.setVertexBufferBinding(vertexBuffer, stride, j++);

      // Bounds
      if (vertexELement.semantic === "POSITION") {
        const { bounds } = mesh;
        vertexCount = accessor.count;
        if (accessor.min && accessor.max) {
          bounds.min.setValueByArray(accessor.min);
          bounds.max.setValueByArray(accessor.max);
        } else {
          const position = MeshParser._tempVector3;
          const { min, max } = bounds;

          min.setValue(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
          max.setValue(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

          const stride = bufferData.length / vertexCount;
          for (let j = 0; j < vertexCount; j++) {
            const offset = j * stride;
            position.setValueByArray(bufferData, offset);
            Vector3.min(min, position, min);
            Vector3.max(max, position, max);
          }
        }
      }
    }
    mesh.setVertexElements(vertexElements);

    // this._createBlendShape(mesh, gltfMesh, gltfPrimitive, getBlendShapeData);

    // Indices
    if (indices !== undefined) {
      const indexAccessor = gltf.accessors[indices];
      const indexData = getIndexBufferData();

      const indexCount = indexAccessor.count;
      const indexFormat = GLTFUtil.getIndexFormat(indexAccessor.componentType);
      const indexByteSize = indexFormat == IndexFormat.UInt32 ? 4 : indexFormat == IndexFormat.UInt16 ? 2 : 1;
      const indexBuffer = new Buffer(
        engine,
        BufferBindFlag.IndexBuffer,
        indexCount * indexByteSize,
        BufferUsage.Static
      );

      indexBuffer.setData(indexData);
      mesh.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, indexFormat));
      mesh.addSubMesh(0, indexCount, mode);
    } else {
      mesh.addSubMesh(0, vertexCount, mode);
    }

    return Promise.resolve(mesh);
  }

  private _createBlendShape(
    mesh: ModelMesh,
    glTFMesh: IMesh,
    glTFPrimitive: IMeshPrimitive,
    getBlendShapeData: (semantic: string, shapeIndex: number) => TypedArray
  ): void {
    const blendShapeNames = glTFMesh.extras ? glTFMesh.extras.targetNames : null;

    for (let i = 0, n = glTFPrimitive.targets.length; i < n; i++) {
      const name = blendShapeNames ? blendShapeNames[i] : `blendShape${i}`;
      const posBuffer = getBlendShapeData("POSITION", i);
      const norBuffer = getBlendShapeData("NORMAL", i);
      const tanBuffer = getBlendShapeData("TANGENT", i);
      const deltaPositions = posBuffer ? this._floatBufferToVector3Array(<Float32Array>posBuffer) : null;
      const deltaNormals = posBuffer ? this._floatBufferToVector3Array(<Float32Array>norBuffer) : null;
      const deltaTangents = posBuffer ? this._floatBufferToVector3Array(<Float32Array>tanBuffer) : null;

      const blendShape = new BlendShape(name);
      blendShape.addFrame(1.0, deltaPositions, deltaNormals, deltaTangents);
      mesh.addBlendShape(blendShape);
    }
  }

  private _floatBufferToVector3Array(buffer: Float32Array): Vector3[] {
    const bufferLen = buffer.length;
    const array = new Array<Vector3>(bufferLen / 3);
    for (let i = 0; i < bufferLen; i += 3) {
      array[i % 3] = new Vector3(buffer[i], buffer[i + 1], buffer[i + 2]);
    }
    return array;
  }
}
