import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Engine,
  IndexBufferBinding,
  IndexFormat,
  Logger,
  MeshTopology,
  SubMesh,
  TypedArray,
  VertexElement
} from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { IGLTF, IMeshPrimitive } from "../schema";
import { createVertexElement, getAccessorData, getIndexFormat, getVertexStride } from "../Util";
import { Parser } from "./Parser";

export class MeshParser extends Parser {
  parse(context: GLTFResource): Promise<void> {
    const { engine, gltf, buffers } = context;
    if (!gltf.meshes) return;

    const meshPromises: Promise<BufferMesh[]>[] = [];

    for (let i = 0; i < gltf.meshes.length; i++) {
      const gltfMesh = gltf.meshes[i];
      const primitivePromises: Promise<BufferMesh>[] = [];

      if (gltfMesh.weights) {
        Logger.error("Sorry, morph animation is not supported now, wait please.");
      }

      for (let j = 0; j < gltfMesh.primitives.length; j++) {
        const gltfPrimitive = gltfMesh.primitives[j];
        const { mode, targets, extensions = {} } = gltfPrimitive;
        const { KHR_draco_mesh_compression } = extensions;

        primitivePromises.push(
          new Promise((resolve) => {
            const mesh = new BufferMesh(engine, gltfMesh.name || j);
            const subMesh = new SubMesh();

            subMesh.topology = mode ?? MeshTopology.Triangles;

            if (targets) {
              Logger.error("Sorry, morph animation is not supported now, wait please.");
            }

            if (KHR_draco_mesh_compression) {
              Parser.createEngineResourceAsync(
                "KHR_draco_mesh_compression",
                KHR_draco_mesh_compression,
                context,
                gltfPrimitive
              )
                .then((decodedGeometry: any) => {
                  return this._parseMeshFromGLTFPrimitive(
                    mesh,
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
                gltfPrimitive,
                gltf,
                (attributeSemantic) => {
                  const accessorIdx = gltfPrimitive.attributes[attributeSemantic];
                  const accessor = gltf.accessors[accessorIdx];
                  return getAccessorData(gltf, accessor, buffers);
                },
                () => {
                  const indexAccessor = gltf.accessors[gltfPrimitive.indices];
                  return getAccessorData(gltf, indexAccessor, buffers);
                },
                engine
              ).then(resolve);
            }
          })
        );

        meshPromises.push(Promise.all(primitivePromises));
      }
    }

    return Promise.all(meshPromises).then((meshes: BufferMesh[][]) => {
      context.meshes = meshes;
    });
  }

  private _parseMeshFromGLTFPrimitive(
    mesh: BufferMesh,
    gltfPrimitive: IMeshPrimitive,
    gltf: IGLTF,
    getVertexBufferData: (semantic: string) => TypedArray,
    getIndexBufferData: () => TypedArray,
    engine: Engine
  ): Promise<BufferMesh> {
    const { attributes, indices } = gltfPrimitive;
    const vertexElements: VertexElement[] = [];
    let j = 0;
    let vertexCount: number;

    for (const attributeSemantic in attributes) {
      const accessorIdx = attributes[attributeSemantic];
      const accessor = gltf.accessors[accessorIdx];
      const stride = getVertexStride(accessor);
      const vertexELement = createVertexElement(attributeSemantic, accessor, j);

      vertexElements.push(vertexELement);
      const bufferData = getVertexBufferData(attributeSemantic);
      const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, bufferData.byteLength, BufferUsage.Static);
      vertexBuffer.setData(bufferData);
      mesh.setVertexBufferBinding(vertexBuffer, stride, j++);

      // compute bounds
      if (vertexELement.semantic == "POSITION") {
        const position = new Vector3();
        vertexCount = bufferData.length / 3;
        const { min, max } = mesh.bounds;
        for (let j = 0; j < vertexCount; j++) {
          const offset = j * 3;
          position.setValue(bufferData[offset], bufferData[offset + 1], bufferData[offset + 2]);
          Vector3.min(min, position, min);
          Vector3.max(max, position, max);
        }
      }
    }
    mesh.setVertexElements(vertexElements);
    // load indices
    if (indices !== undefined) {
      const indexAccessor = gltf.accessors[indices];
      const indexData = getIndexBufferData();

      const indexCount = indexAccessor.count;
      const indexFormat = getIndexFormat(indexAccessor.componentType);
      const indexByteSize = indexFormat == IndexFormat.UInt32 ? 4 : indexFormat == IndexFormat.UInt16 ? 2 : 1;
      const indexBuffer = new Buffer(
        engine,
        BufferBindFlag.IndexBuffer,
        indexCount * indexByteSize,
        BufferUsage.Static
      );

      indexBuffer.setData(indexData);
      mesh.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, indexFormat));
      mesh.addSubMesh(0, indexCount);
    } else {
      mesh.addSubMesh(0, vertexCount);
    }

    return Promise.resolve(mesh);
  }
}
