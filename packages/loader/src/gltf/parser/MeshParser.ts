import {
  AssetPromise,
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
import { AccessorType, IGLTF, IMesh, IMeshPrimitive } from "../Schema";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class MeshParser extends Parser {
  private static _tempVector3 = new Vector3();

  parse(context: ParserContext) {
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
        const { extensions = {} } = gltfPrimitive;
        const { KHR_draco_mesh_compression } = extensions;

        primitivePromises[j] = new Promise((resolve) => {
          const mesh = new ModelMesh(engine, gltfMesh.name || j + "");

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
                return this._parseMeshFromGLTFPrimitiveDraco(
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

  /**
   * @deprecated
   */
  private _parseMeshFromGLTFPrimitiveDraco(
    mesh: ModelMesh,
    gltfMesh: IMesh,
    gltfPrimitive: IMeshPrimitive,
    gltf: IGLTF,
    getVertexBufferData: (semantic: string) => TypedArray,
    getBlendShapeData: (semantic: string, shapeIndex: number) => TypedArray,
    getIndexBufferData: () => TypedArray,
    keepMeshData: boolean
  ): Promise<ModelMesh> {
    const { attributes, targets, indices, mode } = gltfPrimitive;
    let vertexCount: number;

    const { accessors } = gltf;
    const accessor = accessors[attributes["POSITION"]];
    const positionBuffer = <Float32Array>getVertexBufferData("POSITION");
    const positions = GLTFUtil.floatBufferToVector3Array(positionBuffer);
    mesh.setPositions(positions);

    const { bounds } = mesh;
    vertexCount = accessor.count;
    if (accessor.min && accessor.max) {
      bounds.min.copyFromArray(accessor.min);
      bounds.max.copyFromArray(accessor.max);
    } else {
      const position = MeshParser._tempVector3;
      const { min, max } = bounds;

      min.set(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
      max.set(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

      const stride = positionBuffer.length / vertexCount;
      for (let j = 0; j < vertexCount; j++) {
        const offset = j * stride;
        position.copyFromArray(positionBuffer, offset);
        Vector3.min(min, position, min);
        Vector3.max(max, position, max);
      }
    }

    for (const attributeSemantic in attributes) {
      if (attributeSemantic === "POSITION") {
        continue;
      }
      const bufferData = getVertexBufferData(attributeSemantic);
      switch (attributeSemantic) {
        case "NORMAL":
          const normals = GLTFUtil.floatBufferToVector3Array(<Float32Array>bufferData);
          mesh.setNormals(normals);
          break;
        case "TEXCOORD_0":
          const texturecoords = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords, 0);
          break;
        case "TEXCOORD_1":
          const texturecoords1 = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords1, 1);
          break;
        case "TEXCOORD_2":
          const texturecoords2 = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords2, 2);
          break;
        case "TEXCOORD_3":
          const texturecoords3 = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords3, 3);
          break;
        case "TEXCOORD_4":
          const texturecoords4 = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords4, 4);
          break;
        case "TEXCOORD_5":
          const texturecoords5 = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords5, 5);
          break;
        case "TEXCOORD_6":
          const texturecoords6 = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords6, 6);
          break;
        case "TEXCOORD_7":
          const texturecoords7 = GLTFUtil.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords7, 7);
          break;
        case "COLOR_0":
          const colors = GLTFUtil.floatBufferToColorArray(
            <Float32Array>bufferData,
            accessors[attributes["COLOR_0"]].type === AccessorType.VEC3
          );
          mesh.setColors(colors);
          break;
        case "TANGENT":
          const tangents = GLTFUtil.floatBufferToVector4Array(<Float32Array>bufferData);
          mesh.setTangents(tangents);
          break;

        case "JOINTS_0":
          const joints = GLTFUtil.floatBufferToVector4Array(<Float32Array>bufferData);
          mesh.setBoneIndices(joints);
          break;
        case "WEIGHTS_0":
          const weights = GLTFUtil.floatBufferToVector4Array(<Float32Array>bufferData);
          mesh.setBoneWeights(weights);
          break;
        default:
          // console.warn(`Unsupport attribute semantic ${attributeSemantic}.`);
          break;
      }
    }

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
}
