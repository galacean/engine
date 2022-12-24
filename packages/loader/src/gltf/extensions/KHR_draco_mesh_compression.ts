import { DRACODecoder } from "@oasis-engine/draco";
import { GLTFUtil } from "../GLTFUtil";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { IMeshPrimitive } from "../Schema";
import { ExtensionParser } from "./ExtensionParser";
import { IKHRDracoMeshCompression } from "./Schema";

@registerExtension("KHR_draco_mesh_compression")
class KHR_draco_mesh_compression extends ExtensionParser {
  private static _decoder: DRACODecoder;

  initialize(): void {
    if (!KHR_draco_mesh_compression._decoder) {
      KHR_draco_mesh_compression._decoder = new DRACODecoder();
    }
  }

  createEngineResource(schema: IKHRDracoMeshCompression, context: ParserContext, gltfPrimitive: IMeshPrimitive) {
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
