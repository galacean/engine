import { IndexFormat, TypedArray, VertexElementFormat } from "@oasis-engine/core";
import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { BufferInfo, ParserContext } from "./parser/ParserContext";
import { AccessorComponentType, AccessorType, IAccessor, IBufferView, IGLTF } from "./Schema";

const charCodeOfDot = ".".charCodeAt(0);
const reEscapeChar = /\\(\\)?/g;
const rePropName = RegExp(
  // Match anything that isn't a dot or bracket.
  "[^.[\\]]+" +
    "|" +
    // Or match property names within brackets.
    "\\[(?:" +
    // Match a non-string expression.
    "([^\"'][^[]*)" +
    "|" +
    // Or match strings (supports escaping characters).
    "([\"'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2" +
    ")\\]" +
    "|" +
    // Or match "" as the space between consecutive dots or empty brackets.
    "(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))",
  "g"
);

/**
 * @internal
 */
export class GLTFUtil {
  public static floatBufferToVector2Array(buffer: Float32Array): Vector2[] {
    const bufferLen = buffer.length;
    const array = new Array<Vector2>(bufferLen / 2);
    for (let i = 0; i < bufferLen; i += 2) {
      array[i / 2] = new Vector2(buffer[i], buffer[i + 1]);
    }
    return array;
  }

  public static floatBufferToVector3Array(buffer: Float32Array): Vector3[] {
    const bufferLen = buffer.length;
    const array = new Array<Vector3>(bufferLen / 3);
    for (let i = 0; i < bufferLen; i += 3) {
      array[i / 3] = new Vector3(buffer[i], buffer[i + 1], buffer[i + 2]);
    }
    return array;
  }

  public static floatBufferToVector4Array(buffer: Float32Array): Vector4[] {
    const bufferLen = buffer.length;
    const array = new Array<Vector4>(bufferLen / 4);
    for (let i = 0; i < bufferLen; i += 4) {
      array[i / 4] = new Vector4(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]);
    }
    return array;
  }

  public static floatBufferToColorArray(buffer: Float32Array, isColor3: boolean): Color[] {
    const bufferLen = buffer.length;
    const colors = new Array<Color>(bufferLen / (isColor3 ? 3 : 4));

    if (isColor3) {
      for (let i = 0; i < bufferLen; i += 3) {
        colors[i / 3] = new Color(buffer[i], buffer[i + 1], buffer[i + 2], 1.0);
      }
    } else {
      for (let i = 0; i < bufferLen; i += 4) {
        colors[i / 4] = new Color(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]);
      }
    }

    return colors;
  }

  /**
   * Parse binary text for glb loader.
   */
  static decodeText(array: Uint8Array): string {
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

  /**
   * Get the number of bytes occupied by accessor type.
   */
  static getAccessorTypeSize(accessorType: AccessorType): number {
    switch (accessorType) {
      case AccessorType.SCALAR:
        return 1;
      case AccessorType.VEC2:
        return 2;
      case AccessorType.VEC3:
        return 3;
      case AccessorType.VEC4:
        return 4;
      case AccessorType.MAT2:
        return 4;
      case AccessorType.MAT3:
        return 9;
      case AccessorType.MAT4:
        return 16;
    }
  }

  /**
   * Get the TypedArray corresponding to the component type.
   */
  static getComponentType(componentType: AccessorComponentType) {
    switch (componentType) {
      case AccessorComponentType.BYTE:
        return Int8Array;
      case AccessorComponentType.UNSIGNED_BYTE:
        return Uint8Array;
      case AccessorComponentType.SHORT:
        return Int16Array;
      case AccessorComponentType.UNSIGNED_SHORT:
        return Uint16Array;
      case AccessorComponentType.UNSIGNED_INT:
        return Uint32Array;
      case AccessorComponentType.FLOAT:
        return Float32Array;
    }
  }

  static getNormalizedComponentScale(componentType: AccessorComponentType) {
    // Reference: https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization#encoding-quantized-data
    switch (componentType) {
      case AccessorComponentType.BYTE:
        return 1 / 127;
      case AccessorComponentType.UNSIGNED_BYTE:
        return 1 / 255;
      case AccessorComponentType.SHORT:
        return 1 / 32767;
      case AccessorComponentType.UNSIGNED_SHORT:
        return 1 / 65535;
      default:
        throw new Error("Oasis.GLTFLoader: Unsupported normalized accessor component type.");
    }
  }

  static getAccessorBuffer(context: ParserContext, gltf: IGLTF, accessor: IAccessor): BufferInfo {
    const { buffers } = context;
    const bufferViews = gltf.bufferViews;

    const componentType = accessor.componentType;
    const bufferView = bufferViews[accessor.bufferView];

    const buffer = buffers[bufferView.buffer];
    const bufferByteOffset = bufferView.byteOffset || 0;
    const byteOffset = accessor.byteOffset || 0;

    const TypedArray = GLTFUtil.getComponentType(componentType);
    const dataElmentSize = GLTFUtil.getAccessorTypeSize(accessor.type);
    const dataElementBytes = TypedArray.BYTES_PER_ELEMENT;
    const elementStride = dataElmentSize * dataElementBytes;
    const accessorCount = accessor.count;
    const bufferStride = bufferView.byteStride;

    let bufferInfo: BufferInfo;
    // According to the glTF official documentation only byteStride not undefined is allowed
    if (bufferStride !== undefined && bufferStride !== elementStride) {
      const bufferSlice = Math.floor(byteOffset / bufferStride);
      const bufferCacheKey = accessor.bufferView + ":" + componentType + ":" + bufferSlice + ":" + accessorCount;
      const accessorBufferCache = context.accessorBufferCache;
      bufferInfo = accessorBufferCache[bufferCacheKey];
      if (!bufferInfo) {
        const offset = bufferByteOffset + bufferSlice * bufferStride;
        const count = accessorCount * (bufferStride / dataElementBytes);
        const data = new TypedArray(buffer, offset, count);
        accessorBufferCache[bufferCacheKey] = bufferInfo = new BufferInfo(data, true, bufferStride);
      }
    } else {
      const offset = bufferByteOffset + byteOffset;
      const count = accessorCount * dataElmentSize;
      const data = new TypedArray(buffer, offset, count);
      bufferInfo = new BufferInfo(data, false, elementStride);
    }

    if (accessor.sparse) {
      const data = GLTFUtil.processingSparseData(gltf, accessor, buffers, bufferInfo.data);
      bufferInfo = new BufferInfo(data, false, bufferInfo.stride);
    }
    return bufferInfo;
  }

  /**
   * @deprecated
   * Get accessor data.
   */
  static getAccessorData(gltf: IGLTF, accessor: IAccessor, buffers: ArrayBuffer[]): TypedArray {
    const bufferViews = gltf.bufferViews;
    const bufferView = bufferViews[accessor.bufferView];
    const arrayBuffer = buffers[bufferView.buffer];
    const accessorByteOffset = accessor.hasOwnProperty("byteOffset") ? accessor.byteOffset : 0;
    const bufferViewByteOffset = bufferView.hasOwnProperty("byteOffset") ? bufferView.byteOffset : 0;
    const byteOffset = accessorByteOffset + bufferViewByteOffset;
    const accessorTypeSize = GLTFUtil.getAccessorTypeSize(accessor.type);
    const length = accessorTypeSize * accessor.count;
    const byteStride = bufferView.byteStride ?? 0;
    const arrayType = GLTFUtil.getComponentType(accessor.componentType);
    let uint8Array;
    if (byteStride) {
      const accessorByteSize = accessorTypeSize * arrayType.BYTES_PER_ELEMENT;
      uint8Array = new Uint8Array(accessor.count * accessorByteSize);
      const originalBufferView = new Uint8Array(arrayBuffer, bufferViewByteOffset, bufferView.byteLength);
      for (let i = 0; i < accessor.count; i++) {
        for (let j = 0; j < accessorByteSize; j++) {
          uint8Array[i * accessorByteSize + j] = originalBufferView[i * byteStride + accessorByteOffset + j];
        }
      }
    } else {
      uint8Array = new Uint8Array(arrayBuffer.slice(byteOffset, byteOffset + length * arrayType.BYTES_PER_ELEMENT));
    }

    const typedArray = new arrayType(uint8Array.buffer);

    if (accessor.sparse) {
      const { count, indices, values } = accessor.sparse;
      const indicesBufferView = bufferViews[indices.bufferView];
      const valuesBufferView = bufferViews[values.bufferView];
      const indicesArrayBuffer = buffers[indicesBufferView.buffer];
      const valuesArrayBuffer = buffers[valuesBufferView.buffer];
      const indicesByteOffset = (indices.byteOffset ?? 0) + (indicesBufferView.byteOffset ?? 0);
      const indicesByteLength = indicesBufferView.byteLength;
      const valuesByteOffset = (values.byteOffset ?? 0) + (valuesBufferView.byteOffset ?? 0);
      const valuesByteLength = valuesBufferView.byteLength;

      const indicesType = GLTFUtil.getComponentType(indices.componentType);
      const indicesArray = new indicesType(
        indicesArrayBuffer,
        indicesByteOffset,
        indicesByteLength / indicesType.BYTES_PER_ELEMENT
      );
      const valuesArray = new arrayType(
        valuesArrayBuffer,
        valuesByteOffset,
        valuesByteLength / arrayType.BYTES_PER_ELEMENT
      );

      for (let i = 0; i < count; i++) {
        const replaceIndex = indicesArray[i];
        for (let j = 0; j < accessorTypeSize; j++) {
          typedArray[replaceIndex * accessorTypeSize + j] = valuesArray[i * accessorTypeSize + j];
        }
      }
    }

    return typedArray;
  }

  static getBufferViewData(bufferView: IBufferView, buffers: ArrayBuffer[]): ArrayBuffer {
    const { buffer, byteOffset = 0, byteLength } = bufferView;
    const arrayBuffer = buffers[buffer];

    return arrayBuffer.slice(byteOffset, byteOffset + byteLength);
  }

  /**
   * Get accessor data.
   */
  static processingSparseData(
    gltf: IGLTF,
    accessor: IAccessor,
    buffers: ArrayBuffer[],
    originData: TypedArray
  ): TypedArray {
    const bufferViews = gltf.bufferViews;
    const accessorTypeSize = GLTFUtil.getAccessorTypeSize(accessor.type);
    const TypedArray = GLTFUtil.getComponentType(accessor.componentType);
    const data = originData.slice();

    const { count, indices, values } = accessor.sparse;
    const indicesBufferView = bufferViews[indices.bufferView];
    const valuesBufferView = bufferViews[values.bufferView];
    const indicesArrayBuffer = buffers[indicesBufferView.buffer];
    const valuesArrayBuffer = buffers[valuesBufferView.buffer];
    const indicesByteOffset = (indices.byteOffset ?? 0) + (indicesBufferView.byteOffset ?? 0);
    const indicesByteLength = indicesBufferView.byteLength;
    const valuesByteOffset = (values.byteOffset ?? 0) + (valuesBufferView.byteOffset ?? 0);
    const valuesByteLength = valuesBufferView.byteLength;

    const IndexTypeArray = GLTFUtil.getComponentType(indices.componentType);
    const indicesArray = new IndexTypeArray(
      indicesArrayBuffer,
      indicesByteOffset,
      indicesByteLength / IndexTypeArray.BYTES_PER_ELEMENT
    );
    const valuesArray = new TypedArray(
      valuesArrayBuffer,
      valuesByteOffset,
      valuesByteLength / TypedArray.BYTES_PER_ELEMENT
    );

    for (let i = 0; i < count; i++) {
      const replaceIndex = indicesArray[i];
      for (let j = 0; j < accessorTypeSize; j++) {
        data[replaceIndex * accessorTypeSize + j] = valuesArray[i * accessorTypeSize + j];
      }
    }

    return data;
  }

  static getIndexFormat(type: AccessorComponentType): IndexFormat {
    switch (type) {
      case AccessorComponentType.UNSIGNED_BYTE:
        return IndexFormat.UInt8;
      case AccessorComponentType.UNSIGNED_SHORT:
        return IndexFormat.UInt16;
      case AccessorComponentType.UNSIGNED_INT:
        return IndexFormat.UInt32;
    }
  }

  static getElementFormat(type: AccessorComponentType, size: number, normalized: boolean = false): VertexElementFormat {
    if (type == AccessorComponentType.FLOAT) {
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

    if (type == AccessorComponentType.SHORT) {
      switch (size) {
        case 2:
          return normalized ? VertexElementFormat.NormalizedShort2 : VertexElementFormat.Short2;
        case 3:
        case 4:
          return normalized ? VertexElementFormat.NormalizedShort4 : VertexElementFormat.Short4;
      }
    }

    if (type == AccessorComponentType.UNSIGNED_SHORT) {
      switch (size) {
        case 2:
          return normalized ? VertexElementFormat.NormalizedUShort2 : VertexElementFormat.UShort2;
        case 3:
        case 4:
          return normalized ? VertexElementFormat.NormalizedUShort4 : VertexElementFormat.UShort4;
      }
    }

    if (type == AccessorComponentType.BYTE) {
      switch (size) {
        case 2:
        case 3:
        case 4:
          return normalized ? VertexElementFormat.NormalizedByte4 : VertexElementFormat.Byte4;
      }
    }

    if (type == AccessorComponentType.UNSIGNED_BYTE) {
      switch (size) {
        case 2:
        case 3:
        case 4:
          return normalized ? VertexElementFormat.NormalizedUByte4 : VertexElementFormat.UByte4;
      }
    }
  }

  /**
   * Load image buffer
   */
  static loadImageBuffer(imageBuffer: ArrayBuffer, type: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const blob = new window.Blob([imageBuffer], { type });
      const img = new Image();
      img.onerror = function () {
        reject(new Error("Failed to load image buffer"));
      };
      img.onload = function () {
        // Call requestAnimationFrame to avoid iOS's bug.
        requestAnimationFrame(() => {
          resolve(img);
          img.onload = null;
          img.onerror = null;
          img.onabort = null;
        });
      };
      img.crossOrigin = "anonymous";
      img.src = URL.createObjectURL(blob);
    });
  }

  static isAbsoluteUrl(url: string): boolean {
    return /^(?:http|blob|data:|\/)/.test(url);
  }

  static parseRelativeUrl(baseUrl: string, relativeUrl: string): string {
    if (GLTFUtil.isAbsoluteUrl(relativeUrl)) {
      return relativeUrl;
    }

    const char0 = relativeUrl.charAt(0);
    if (char0 === ".") {
      return GLTFUtil._formatRelativePath(relativeUrl + relativeUrl);
    }

    return baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1) + relativeUrl;
  }

  /**
   * Parse the glb format.
   */
  static parseGLB(glb: ArrayBuffer): {
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
      console.error("Invalid glb chunk type. Expected 0x4E4F534A, found 0x" + chunkType.toString(16));
      return null;
    }

    const glTFData = new Uint8Array(glb, GLB_HEADER_LENGTH + 2 * UINT32_LENGTH, chunkLength);
    const gltf: IGLTF = JSON.parse(GLTFUtil.decodeText(glTFData));

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

  private static _formatRelativePath(value: string): string {
    const parts = value.split("/");
    for (let i = 0, n = parts.length; i < n; i++) {
      if (parts[i] == "..") {
        parts.splice(i - 1, 2);
        i -= 2;
      }
    }
    return parts.join("/");
  }
}
