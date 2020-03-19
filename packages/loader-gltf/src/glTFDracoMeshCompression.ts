import { DRACODecoder } from "@alipay/o3-draco";
import { getComponentType, createAttribute, getBufferData, getAccessorData } from "./Util";

let decoder;

export const glTFDracoMeshCompression = {
  init() {
    decoder = new DRACODecoder();
  },
  parse(extension, primitive, gltfPrimitive, gltf, buffers) {
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
    return decoder.decode(buffer, taskConfig).then(geometry => {
      let h = 0;
      for (let i = 0; i < geometry.attributes.length; i++) {
        const attribute = geometry.attributes[i];
        const accessorIdx = gltfPrimitive.attributes[attribute.name];
        const accessor = accessors[accessorIdx];
        accessor.bufferView = accessor.bufferView === undefined ? bufferViewIndex : accessor.bufferView;
        primitive.vertexBuffers.push(attribute.array);
        primitive.vertexAttributes[attribute.name] = createAttribute(gltf, attribute.name, accessor, h++);
      }

      // get vertex count
      const positionAccessorIdx = gltfPrimitive.attributes.POSITION;
      const positionAccessor = accessors[positionAccessorIdx];
      primitive.vertexCount = positionAccessor.count;

      // load indices
      primitive.indexCount = indexAccessor.count;
      primitive.indexType = indexAccessor.componentType;
      primitive.indexOffset = 0;
      primitive.indexBuffer = geometry.index.array;
      return primitive;
    });
  }
};
