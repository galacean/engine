import { DataType, IndexFormat, VertexElement, VertexElementFormat } from "@oasis-engine/core";
import { IAccessor, IBufferView, IGLTF } from "./schema";

const WEBGL_COMPONENT_TYPES = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
};

/**
 * Parse binary text for glb loader.
 * @param array
 * @returns String
 * @private
 */
export function decodeText(array) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(array);
  }

  // TextDecoder polyfill
  let s = "";

  for (let i = 0, il = array.length; i < il; i++) {
    s += String.fromCharCode(array[i]);
  }

  return decodeURIComponent(encodeURIComponent(s));
}

/** Get the number of bytes occupied by accessor type.
 * @return {number}
 * @param {string} accessorType
 * @private
 */
export function getAccessorTypeSize(accessorType) {
  const ACCESSOR_TYPE_SIZE = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16
  };
  return ACCESSOR_TYPE_SIZE[accessorType];
}

/** Get the TypedArray corresponding to the component type.
 * @return {function}
 * @param {string} componentType
 */
export function getComponentType(componentType) {
  return WEBGL_COMPONENT_TYPES[componentType];
}

/**
 * Get accessor data.
 * @param gltf
 * @param accessor
 * @param buffers
 * @private
 */
export function getAccessorData(gltf: IGLTF, accessor: IAccessor, buffers: ArrayBuffer[]) {
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const arrayBuffer = buffers[bufferView.buffer];
  const accessorByteOffset = accessor.hasOwnProperty("byteOffset") ? accessor.byteOffset : 0;
  const bufferViewByteOffset = bufferView.hasOwnProperty("byteOffset") ? bufferView.byteOffset : 0;
  const byteOffset = accessorByteOffset + bufferViewByteOffset;
  const accessorTypeSize = getAccessorTypeSize(accessor.type);
  const length = accessorTypeSize * accessor.count;
  const byteStride = bufferView.byteStride ?? 0;

  const arrayType = getComponentType(accessor.componentType);
  let uint8Array;
  if (byteStride) {
    uint8Array = new Uint8Array(length * arrayType.BYTES_PER_ELEMENT);
    const originalBufferView = new Uint8Array(arrayBuffer, bufferViewByteOffset, bufferView.byteLength);
    let viewAccessor = 0;
    const accessorByteSize = accessorTypeSize * arrayType.BYTES_PER_ELEMENT;
    for (let i = 0; i < accessor.count; i++) {
      viewAccessor = i * byteStride + accessorByteOffset;
      for (let j = 0; j < accessorByteSize; j++) {
        uint8Array[i * accessorByteSize + j] = originalBufferView[viewAccessor + j];
      }
    }
  } else {
    uint8Array = new Uint8Array(arrayBuffer, byteOffset, length * arrayType.BYTES_PER_ELEMENT);
    uint8Array = new Uint8Array(uint8Array);
  }

  return new arrayType(uint8Array.buffer);
}

export function getBufferViewData(bufferView: IBufferView, buffers: ArrayBuffer[]): ArrayBuffer {
  const { buffer, byteOffset = 0, byteLength } = bufferView;
  const arrayBuffer = buffers[buffer];

  return arrayBuffer.slice(byteOffset, byteOffset + byteLength);
}

export function getVertexStride(accessor: IAccessor): number {
  const size = getAccessorTypeSize(accessor.type);
  const componentType = getComponentType(accessor.componentType);
  return size * componentType.BYTES_PER_ELEMENT;
}

export function createVertexElement(semantic: string, accessor: IAccessor, index: number): VertexElement {
  const size = getAccessorTypeSize(accessor.type);
  return new VertexElement(semantic, 0, getElementFormat(accessor.componentType, size), index);
}

export function getIndexFormat(type: number): IndexFormat {
  switch (type) {
    case DataType.UNSIGNED_BYTE:
      return IndexFormat.UInt8;
    case DataType.UNSIGNED_SHORT:
      return IndexFormat.UInt16;
    case DataType.UNSIGNED_INT:
      return IndexFormat.UInt32;
  }
}

export function getElementFormat(type: number, size: number): VertexElementFormat {
  if (type == DataType.FLOAT) {
    switch (size) {
      case 1:
        return VertexElementFormat.Float;
      case 2:
        return VertexElementFormat.Vector2;
      case 3:
        return VertexElementFormat.Vector3;
      case 4:
        return VertexElementFormat.Vector4;
    }
  }
  if (type == DataType.UNSIGNED_SHORT) {
    switch (size) {
      case 2:
        return VertexElementFormat.UShort2;
      case 4:
        return VertexElementFormat.UShort4;
    }
  }
}

/**
 * Load image buffer
 * @param imageBuffer
 * @param type
 * @param callback
 */
export function loadImageBuffer(imageBuffer: ArrayBuffer, type: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new window.Blob([imageBuffer], { type });
    const img = new Image();
    img.src = URL.createObjectURL(blob);

    img.crossOrigin = "anonymous";
    img.onerror = function () {
      reject(new Error("Failed to load image buffer"));
    };
    img.onload = function () {
      // Call requestAnimationFrame to avoid iOS's bug.
      requestAnimationFrame(() => {
        resolve(img);
      });
    };
  });
}

function isAbsoluteUrl(url: string): boolean {
  return /^(?:http|blob|data:|\/)/.test(url);
}

export function parseRelativeUrl(baseUrl: string, relativeUrl: string): string {
  if (isAbsoluteUrl(relativeUrl)) {
    return relativeUrl;
  }
  // TODO: implement ../path
  return baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1) + relativeUrl;
}

/**
 * Parse the glb format.
 * @param glb - Binary data
 * @returns GlTF information and bin information in Object glb.
 * @private
 */
export function parseGLB(
  glb: ArrayBuffer
): {
  gltf: IGLTF;
  buffers: ArrayBuffer[];
} {
  const UINT32_LENGTH = 4;
  const GLB_HEADER_MAGIC = 0x46546c67; // 'glTF'
  const GLB_HEADER_LENGTH = 12;
  const GLB_CHUNK_TYPES = { JSON: 0x4e4f534a, BIN: 0x004e4942 };

  const dataView = new DataView(glb);

  // read header
  const header = {
    magic: dataView.getUint32(0, true),
    version: dataView.getUint32(UINT32_LENGTH, true),
    length: dataView.getUint32(2 * UINT32_LENGTH, true)
  };

  if (header.magic !== GLB_HEADER_MAGIC) {
    console.error("Invalid glb magic number. Expected 0x46546C67, found 0x" + header.magic.toString(16));
    return null;
  }

  // read main data
  let chunkLength = dataView.getUint32(GLB_HEADER_LENGTH, true);
  let chunkType = dataView.getUint32(GLB_HEADER_LENGTH + UINT32_LENGTH, true);

  // read glTF json
  if (chunkType !== GLB_CHUNK_TYPES.JSON) {
    console.error("Invalid glb chunk type. Expected 0x004E4942, found 0x" + chunkType.toString(16));
    return null;
  }

  const glTFData = new Uint8Array(glb, GLB_HEADER_LENGTH + 2 * UINT32_LENGTH, chunkLength);
  const gltf: IGLTF = JSON.parse(decodeText(glTFData));

  // read all buffers
  const buffers: ArrayBuffer[] = [];
  let byteOffset = GLB_HEADER_LENGTH + 2 * UINT32_LENGTH + chunkLength;

  while (byteOffset < header.length) {
    chunkLength = dataView.getUint32(byteOffset, true);
    chunkType = dataView.getUint32(byteOffset + UINT32_LENGTH, true);

    if (chunkType !== GLB_CHUNK_TYPES.BIN) {
      console.error("Invalid glb chunk type. Expected 0x004E4942, found 0x" + chunkType.toString(16));
      return null;
    }

    const currentOffset = byteOffset + 2 * UINT32_LENGTH;
    const buffer = glb.slice(currentOffset, currentOffset + chunkLength);
    buffers.push(buffer);

    byteOffset += chunkLength + 2 * UINT32_LENGTH;
  }

  return {
    gltf,
    buffers
  };
}
