let decoderPending;
let decoderConfig;

onmessage = function(e) {
  const message = e.data;

  switch (message.type) {
    case "init":
      decoderConfig = message.decoderConfig;
      decoderPending = new Promise(function(resolve /*, reject*/) {
        decoderConfig.onModuleLoaded = function(draco) {
          // Module is Promise-like. Wrap before resolving to avoid loop.
          resolve({ draco: draco });
        };
        DracoDecoderModule(decoderConfig);
      });
      break;

    case "decode":
      var buffer = message.buffer;
      var taskConfig = message.taskConfig;
      decoderPending.then(module => {
        var draco = module.draco;
        var decoder = new draco.Decoder();
        var decoderBuffer = new draco.DecoderBuffer();
        decoderBuffer.Init(new Int8Array(buffer), buffer.byteLength);
        try {
          var geometry = decodeGeometry(draco, decoder, decoderBuffer, taskConfig);
          var buffers = geometry.attributes.map(attr => attr.array.buffer);
          if (geometry.index) buffers.push(geometry.index.array.buffer);
          self.postMessage({ type: "decode", id: message.id, geometry }, buffers);
        } catch (error) {
          console.error(error);
          self.postMessage({ type: "error", id: message.id, error: error.message });
        } finally {
          draco.destroy(decoderBuffer);
          draco.destroy(decoder);
        }
      });
      break;
  }
};

function decodeGeometry(draco, decoder, decoderBuffer, taskConfig) {
  const attributeIDs = taskConfig.attributeIDs;
  const attributeTypes = taskConfig.attributeTypes;

  let dracoGeometry;
  let decodingStatus;

  const geometryType = decoder.GetEncodedGeometryType(decoderBuffer);
  if (geometryType === draco.TRIANGULAR_MESH) {
    dracoGeometry = new draco.Mesh();
    decodingStatus = decoder.DecodeBufferToMesh(decoderBuffer, dracoGeometry);
  } else {
    throw new Error("DRACODecoder: Unexpected geometry type.");
  }

  if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
    throw new Error("DRACODecoder: Decoding failed: " + decodingStatus.error_msg());
  }

  const geometry = { index: null, attributes: [] };

  // Gather all vertex attributes.
  for (let attributeName in attributeIDs) {
    const attributeType = self[attributeTypes[attributeName]];

    let attribute;
    let attributeID;

    // A Draco file may be created with default vertex attributes, whose attribute IDs
    // are mapped 1:1 from their semantic name (POSITION, NORMAL, ...). Alternatively,
    // a Draco file may contain a custom set of attributes, identified by known unique
    // IDs. glTF files always do the latter, and `.drc` files typically do the former.
    if (taskConfig.useUniqueIDs) {
      attributeID = attributeIDs[attributeName];
      attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID);
    } else {
      attributeID = decoder.GetAttributeId(dracoGeometry, draco[attributeIDs[attributeName]]);
      if (attributeID === -1) continue;
      attribute = decoder.GetAttribute(dracoGeometry, attributeID);
    }
    geometry.attributes.push(decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute));
  }
  // Add index.
  if (geometryType === draco.TRIANGULAR_MESH) {
    // Generate mesh faces.
    const numFaces = dracoGeometry.num_faces();
    const numIndices = numFaces * 3;
    let dataSize;
    let ptr;
    let index;
    const indexType = self[taskConfig.indexType];

    switch (indexType) {
      case Uint16Array:
        dataSize = numIndices * 2;
        ptr = draco._malloc(dataSize);
        decoder.GetTrianglesUInt16Array(dracoGeometry, dataSize, ptr);
        index = new Uint16Array(draco.HEAPU16.buffer, ptr, numIndices).slice();
        draco._free(ptr);
        break;
      case Uint32Array:
        dataSize = numIndices * 4;
        ptr = draco._malloc(dataSize);
        decoder.GetTrianglesUInt32Array(dracoGeometry, dataSize, ptr);
        index = new Uint32Array(draco.HEAPU32.buffer, ptr, numIndices).slice();
        draco._free(ptr);
      default:
        throw new Error("DRACODecoder: Unexpected index type.");
    }
    geometry.index = { array: index, itemSize: 1 };
  }
  draco.destroy(dracoGeometry);
  return geometry;
}

function decodeAttribute(draco, decoder, dracoGeometry, attributeName, attributeType, attribute) {
  const numComponents = attribute.num_components();
  const numPoints = dracoGeometry.num_points();
  const numValues = numPoints * numComponents;
  let ptr;
  let array;
  let dataSize;
  switch (attributeType) {
    case Float32Array:
      dataSize = numValues * 4;
      ptr = draco._malloc(dataSize);
      decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_FLOAT32, dataSize, ptr);
      array = new Float32Array(draco.HEAPF32.buffer, ptr, numValues).slice();
      draco._free(ptr);
      break;

    case Int8Array:
      ptr = draco._malloc(numValues);
      decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_INT8, numValues, ptr);
      array = new Int8Array(draco.HEAP8.buffer, ptr, numValues).slice();
      draco._free(ptr);
      break;

    case Int16Array:
      dataSize = numValues * 2;
      ptr = draco._malloc(dataSize);
      decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_INT16, dataSize, ptr);
      array = new Int16Array(draco.HEAP16.buffer, ptr, numValues).slice();
      draco._free(ptr);
      break;

    case Int32Array:
      dataSize = numValues * 4;
      ptr = draco._malloc(dataSize);
      decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_INT32, dataSize, ptr);
      array = new Int32Array(draco.HEAP32.buffer, ptr, numValues).slice();
      draco._free(ptr);
      break;

    case Uint8Array:
      ptr = draco._malloc(numValues);
      decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_UINT8, numValues, ptr);
      array = new Uint8Array(draco.HEAPU8.buffer, ptr, numValues).slice();
      draco._free(ptr);
      break;

    case Uint16Array:
      dataSize = numValues * 2;
      ptr = draco._malloc(dataSize);
      decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_UINT16, dataSize, ptr);
      array = new Uint16Array(draco.HEAPU16.buffer, ptr, numValues).slice();
      draco._free(ptr);
      break;

    case Uint32Array:
      dataSize = numValues * 4;
      ptr = draco._malloc(dataSize);
      decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, draco.DT_UINT32, dataSize, ptr);
      array = new Uint32Array(draco.HEAPU32.buffer, ptr, numValues).slice();
      draco._free(ptr);
      break;

    default:
      throw new Error("DRACODecoder: Unexpected attribute type.");
  }

  return {
    name: attributeName,
    array: array,
    itemSize: numComponents
  };
}
