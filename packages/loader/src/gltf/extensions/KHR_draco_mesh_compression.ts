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

  createEngineResource(schema: IKHRDracoMeshCompression, context: ParserContext, glTFPrimitive: IMeshPrimitive) {
    const { glTF, buffers } = context;
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
        attributeTypeMap[attributeName] = GLTFUtil.getComponentType(accessorDef.componentType).name;
      }
    }
    const indexAccessor = accessors[glTFPrimitive.indices];
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
