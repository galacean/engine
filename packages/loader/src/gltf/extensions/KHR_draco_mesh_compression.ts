import { DRACODecoder } from "@oasis-engine/draco";
import { IMeshPrimitive } from "../GLTFSchema";
import { GLTFUtil } from "../GLTFUtil";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRDracoMeshCompression } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_draco_mesh_compression")
class KHR_draco_mesh_compression extends GLTFExtensionParser {
  mode = GLTFExtensionMode.CreateAndParse;

  private static _decoder: DRACODecoder;

  initialize(): void {
    if (!KHR_draco_mesh_compression._decoder) {
      KHR_draco_mesh_compression._decoder = new DRACODecoder();
    }
  }

  createAndParse(context: GLTFParserContext, schema: IKHRDracoMeshCompression, gltfPrimitive: IMeshPrimitive) {
    const { gltf, buffers } = context;
    const { bufferViews, accessors } = gltf;
    const { bufferView: bufferViewIndex, attributes: gltfAttributeMap } = schema;

    const attributeMap = {};
    const attributeTypeMap = {};
    for (let attributeName in gltfAttributeMap) {
      attributeMap[attributeName] = gltfAttributeMap[attributeName];
    }
    for (let attributeName in gltfPrimitive.attributes) {
      if (gltfAttributeMap[attributeName] !== undefined) {
        const accessorDef = accessors[gltfPrimitive.attributes[attributeName]];
        attributeTypeMap[attributeName] = GLTFUtil.getComponentType(accessorDef.componentType).name;
      }
    }
    const indexAccessor = accessors[gltfPrimitive.indices];
    const indexType = GLTFUtil.getComponentType(indexAccessor.componentType).name;
    const taskConfig = {
      attributeIDs: attributeMap,
      attributeTypes: attributeTypeMap,
      useUniqueIDs: true,
      indexType
    };
    const buffer = GLTFUtil.getBufferViewData(bufferViews[bufferViewIndex], buffers);
    return KHR_draco_mesh_compression._decoder.decode(buffer, taskConfig).then((parsedGeometry) => parsedGeometry);
  }
}
