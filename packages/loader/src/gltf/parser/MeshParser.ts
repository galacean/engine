import { BlendShape, EngineObject, ModelMesh, TypedArray } from "@oasis-engine/core";
import { Vector3 } from "@oasis-engine/math";
import { GLTFUtil } from "../GLTFUtil";
import { AccessorType, IGLTF, IMesh, IMeshPrimitive } from "../Schema";
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
    const positionAccessor = accessors[attributes["POSITION"]];
    const positionBuffer = <Float32Array>getVertexBufferData("POSITION");
    const positions = GLTFUtil.typedArrayToVector3Array(positionBuffer);
    const positionVertexElementFormat = GLTFUtil.getElementFormat(
      positionAccessor.componentType,
      GLTFUtil.getAccessorTypeSize(positionAccessor.type),
      positionAccessor.normalized
    );
    mesh.setPositions(positions, positionVertexElementFormat);

    const { bounds } = mesh;
    vertexCount = positionAccessor.count;
    if (positionAccessor.min && positionAccessor.max) {
      bounds.min.copyFromArray(positionAccessor.min);
      bounds.max.copyFromArray(positionAccessor.max);
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
      const attributeAccessor = accessors[attributes[attributeSemantic]];
      const vertexElementFormat = GLTFUtil.getElementFormat(
        attributeAccessor.componentType,
        GLTFUtil.getAccessorTypeSize(attributeAccessor.type),
        attributeAccessor.normalized
      );

      switch (attributeSemantic) {
        case "NORMAL":
          const normals = GLTFUtil.typedArrayToVector3Array(bufferData);
          mesh.setNormals(normals, vertexElementFormat);
          break;
        case "TEXCOORD_0":
          const texturecoords = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords, 0, vertexElementFormat);
          break;
        case "TEXCOORD_1":
          const texturecoords1 = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords1, 1, vertexElementFormat);
          break;
        case "TEXCOORD_2":
          const texturecoords2 = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords2, 2, vertexElementFormat);
          break;
        case "TEXCOORD_3":
          const texturecoords3 = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords3, 3, vertexElementFormat);
          break;
        case "TEXCOORD_4":
          const texturecoords4 = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords4, 4, vertexElementFormat);
          break;
        case "TEXCOORD_5":
          const texturecoords5 = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords5, 5, vertexElementFormat);
          break;
        case "TEXCOORD_6":
          const texturecoords6 = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords6, 6, vertexElementFormat);
          break;
        case "TEXCOORD_7":
          const texturecoords7 = GLTFUtil.typedArrayToVector2Array(bufferData);
          mesh.setUVs(texturecoords7, 7, vertexElementFormat);
          break;
        case "COLOR_0":
          const colors = GLTFUtil.typedArrayToColorArray(
            bufferData,
            accessors[attributes["COLOR_0"]].type === AccessorType.VEC3
          );
          mesh.setColors(colors, vertexElementFormat);
          break;
        case "TANGENT":
          const tangents = GLTFUtil.typedArrayToVector4Array(bufferData);
          mesh.setTangents(tangents, vertexElementFormat);
          break;

        case "JOINTS_0":
          const joints = GLTFUtil.typedArrayToVector4Array(bufferData);
          mesh.setBoneIndices(joints, vertexElementFormat);
          break;
        case "WEIGHTS_0":
          const weights = GLTFUtil.typedArrayToVector4Array(bufferData);
          mesh.setBoneWeights(weights, vertexElementFormat);
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
      const deltaPositions = deltaPosBuffer ? GLTFUtil.typedArrayToVector3Array(deltaPosBuffer) : null;
      const deltaNormals = deltaNorBuffer ? GLTFUtil.typedArrayToVector3Array(deltaNorBuffer) : null;
      const deltaTangents = deltaTanBuffer ? GLTFUtil.typedArrayToVector3Array(deltaTanBuffer) : null;

      const blendShape = new BlendShape(name);
      blendShape.addFrame(1.0, deltaPositions, deltaNormals, deltaTangents);
      mesh.addBlendShape(blendShape);
    }
  }
}
