import { DRACODecoder } from "@oasis-engine/draco";
import { getComponentType, getBufferData } from "./Util";

let decoder;

export const glTFDracoMeshCompression = {
  init() {
    if (!decoder) {
      decoder = new DRACODecoder();
    }
  },
  parse(extension, gltfPrimitive, gltf, buffers) {
    const { bufferViews, accessors } = gltf;
    const bufferViewIndex = extension.bufferView;
    const gltfAttributeMap = extension.attributes;
    const attributeMap = {};
    const attributeTypeMap = {};

    for (let attributeName in gltfAttributeMap) {
      attributeMap[attributeName] = gltfAttributeMap[attributeName];
    }

    for (let attributeName in gltfPrimitive.attributes) {
      if (gltfAttributeMap[attributeName] !== undefined) {
        const accessorDef = accessors[gltfPrimitive.attributes[attributeName]];
        attributeTypeMap[attributeName] = getComponentType(accessorDef.componentType).name;
      }
    }
    const indexAccessor = accessors[gltfPrimitive.indices];
    const indexType = getComponentType(indexAccessor.componentType).name;
    const taskConfig = {
      attributeIDs: attributeMap,
      attributeTypes: attributeTypeMap,
      useUniqueIDs: true,
      indexType
    };
    const buffer = getBufferData(bufferViews[bufferViewIndex], buffers);

    return decoder.decode(buffer, taskConfig).then((parsedGeometry) => parsedGeometry);
  }
};
