import { ModelMesh, TypedArray } from "@galacean/engine-core";
import { DRACODecoder } from "@galacean/engine-draco";
import { Vector3 } from "@galacean/engine-math";
import { AccessorType, IGLTF, IMesh, IMeshPrimitive } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFMeshParser } from "../parser";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { BufferInfo, GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRDracoMeshCompression } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_draco_mesh_compression", GLTFExtensionMode.CreateAndParse)
class KHR_draco_mesh_compression extends GLTFExtensionParser {
  private static _decoder: DRACODecoder;
  private static _tempVector3 = new Vector3();

  override initialize(): void {
    if (!KHR_draco_mesh_compression._decoder) {
      KHR_draco_mesh_compression._decoder = new DRACODecoder();
    }
  }

  override createAndParse(
    context: GLTFParserContext,
    schema: IKHRDracoMeshCompression,
    glTFPrimitive: IMeshPrimitive,
    glTFMesh: IMesh
  ) {
    const {
      glTF,
      glTFResource: { engine }
    } = context;
    const { bufferViews, accessors } = glTF;
    const { bufferView: bufferViewIndex, attributes: gltfAttributeMap } = schema;

    const attributeMap = {};
    const attributeTypeMap = {};
    for (let attributeName in gltfAttributeMap) {
      attributeMap[attributeName] = gltfAttributeMap[attributeName];
    }
    for (let attributeName in glTFPrimitive.attributes) {
      if (gltfAttributeMap[attributeName] !== undefined) {
        const accessorDef = accessors[glTFPrimitive.attributes[attributeName]];
        attributeTypeMap[attributeName] = GLTFUtils.getComponentType(accessorDef.componentType).name;
      }
    }
    const indexAccessor = accessors[glTFPrimitive.indices];
    const indexType = GLTFUtils.getComponentType(indexAccessor.componentType).name;
    const taskConfig = {
      attributeIDs: attributeMap,
      attributeTypes: attributeTypeMap,
      useUniqueIDs: true,
      indexType
    };

    return context.getBuffers().then((buffers) => {
      const buffer = GLTFUtils.getBufferViewData(bufferViews[bufferViewIndex], buffers);
      return KHR_draco_mesh_compression._decoder.decode(buffer, taskConfig).then((decodedGeometry) => {
        const mesh = new ModelMesh(engine, glTFMesh.name);
        return this._parseMeshFromGLTFPrimitiveDraco(
          mesh,
          glTFMesh,
          glTFPrimitive,
          glTF,
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
      });
    });
  }

  private _parseMeshFromGLTFPrimitiveDraco(
    mesh: ModelMesh,
    gltfMesh: IMesh,
    gltfPrimitive: IMeshPrimitive,
    gltf: IGLTF,
    getVertexBufferData: (semantic: string) => TypedArray,
    getBlendShapeData: (semantic: string, shapeIndex: number) => Promise<BufferInfo>,
    getIndexBufferData: () => TypedArray,
    keepMeshData: boolean
  ): Promise<ModelMesh> {
    const { attributes, targets, indices, mode } = gltfPrimitive;
    let vertexCount: number;

    const { accessors } = gltf;
    const accessor = accessors[attributes["POSITION"]];
    const positionBuffer = <Float32Array>getVertexBufferData("POSITION");
    const positions = GLTFUtils.floatBufferToVector3Array(positionBuffer);
    mesh.setPositions(positions);

    const { bounds } = mesh;
    vertexCount = accessor.count;
    if (accessor.min && accessor.max) {
      bounds.min.copyFromArray(accessor.min);
      bounds.max.copyFromArray(accessor.max);
    } else {
      const position = KHR_draco_mesh_compression._tempVector3;
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
          const normals = GLTFUtils.floatBufferToVector3Array(<Float32Array>bufferData);
          mesh.setNormals(normals);
          break;
        case "TEXCOORD_0":
          const texturecoords = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords, 0);
          break;
        case "TEXCOORD_1":
          const texturecoords1 = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords1, 1);
          break;
        case "TEXCOORD_2":
          const texturecoords2 = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords2, 2);
          break;
        case "TEXCOORD_3":
          const texturecoords3 = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords3, 3);
          break;
        case "TEXCOORD_4":
          const texturecoords4 = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords4, 4);
          break;
        case "TEXCOORD_5":
          const texturecoords5 = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords5, 5);
          break;
        case "TEXCOORD_6":
          const texturecoords6 = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords6, 6);
          break;
        case "TEXCOORD_7":
          const texturecoords7 = GLTFUtils.floatBufferToVector2Array(<Float32Array>bufferData);
          mesh.setUVs(texturecoords7, 7);
          break;
        case "COLOR_0":
          const colors = GLTFUtils.floatBufferToColorArray(
            <Float32Array>bufferData,
            accessors[attributes["COLOR_0"]].type === AccessorType.VEC3
          );
          mesh.setColors(colors);
          break;
        case "TANGENT":
          const tangents = GLTFUtils.floatBufferToVector4Array(<Float32Array>bufferData);
          mesh.setTangents(tangents);
          break;

        case "JOINTS_0":
          const joints = GLTFUtils.floatBufferToVector4Array(<Float32Array>bufferData);
          mesh.setBoneIndices(joints);
          break;
        case "WEIGHTS_0":
          const weights = GLTFUtils.floatBufferToVector4Array(<Float32Array>bufferData);
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
    targets && GLTFMeshParser._createBlendShape(mesh, null, gltfMesh, accessors, targets, getBlendShapeData);

    mesh.uploadData(!keepMeshData);
    return Promise.resolve(mesh);
  }
}
