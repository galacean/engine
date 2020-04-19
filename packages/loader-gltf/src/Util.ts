import { path } from "@alipay/o3-loader";

const WEBGL_COMPONENT_TYPES = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
};

/**
 * 解析二进制文本 用于 glb loader
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

/**
 * 根据 glTF 中的 paramters[name] 来查找 uniform 对象
 * @param obj
 * @param key
 * @param value
 * @returns {object}
 * @private
 */
export function findByKeyValue(obj, key, value) {
  for (const name in obj) {
    if (obj[name][key] === value) {
      return obj[name];
    }
  }
  return null;
}

/** 获取 accessor type 占用字节数
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

/** 获取 component type 对应的 TypedArray
 * @return {function}
 * @param {string} componentType
 */
export function getComponentType(componentType) {
  return WEBGL_COMPONENT_TYPES[componentType];
}

/**
 * 获取 accessor 数据
 * @param gltf
 * @param accessor
 * @param buffers
 * @private
 */
export function getAccessorData(gltf, accessor, buffers) {
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const arrayBuffer = buffers[bufferView.buffer];
  const accessorByteOffset = accessor.hasOwnProperty("byteOffset") ? accessor.byteOffset : 0;
  const bufferViewByteOffset = bufferView.hasOwnProperty("byteOffset") ? bufferView.byteOffset : 0;
  const byteOffset = accessorByteOffset + bufferViewByteOffset;
  const accessorTypeSize = getAccessorTypeSize(accessor.type);
  const length = accessorTypeSize * accessor.count;
  const byteStride = bufferView.byteStride ?? 0;
  // const CTOR_MAP = {
  //   // 5120 (BYTE)	1
  //   // 5121(UNSIGNED_BYTE)	1
  //   // 5122 (SHORT)	2
  //   // 5123 (UNSIGNED_SHORT)	2
  //   // 5125 (UNSIGNED_INT)	4
  //   // 5126 (FLOAT)	4
  //   5120: Int8Array,
  //   5121: Uint8Array,
  //   5122: Int16Array,
  //   5123: Uint16Array,
  //   5125: Uint32Array,
  //   5126: Float32Array
  // };

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

/**
 * 获取 buffer 数据
 * @param bufferView
 * @param buffers
 * @returns {Blob|ArrayBuffer|Array.<T>|string}
 * @private
 */
export function getBufferData(bufferView, buffers) {
  // get bufferView
  const arrayBuffer = buffers[bufferView.buffer];
  const byteOffset = bufferView.byteOffset || 0;
  return arrayBuffer.slice(byteOffset, byteOffset + bufferView.byteLength);
}

/**
 * 生成 attribute 数据结构
 * @param gltf
 * @param semantic
 * @param accessor
 * @param idx
 * @returns {{name: *, size: number, type: *, normalized: boolean, stride: (*|number), offset: (Number|number|*), vertexBufferIndex: (*|number)}}
 * @private
 */
export function createAttribute(gltf, semantic, accessor, idx) {
  // {
  //   name,
  //     size,
  //     type,
  //     normalized,
  //     stride,
  //     offset,
  //     vertexBufferIndex
  // }
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const size = getAccessorTypeSize(accessor.type);
  const componentType = getComponentType(accessor.componentType);
  const stride = size * componentType.BYTES_PER_ELEMENT;
  return {
    name: semantic,
    size,
    type: accessor.componentType,
    normalized: false,
    // stride: bufferView.byteStride || 0,
    stride,
    offset: 0,
    vertexBufferIndex: idx || 0
  };
}

/**
 * 处理 glTF 中资源对象 并生成资源请求数据
 * @param dir 相对 url
 * @param loadQueue 加载队列
 * @param arr 资源对象数组
 * @param type 使用 request 库请求资源的类型
 * @param filesMap 资源链接查找表
 * @param {boolean} reSample - 是否 reSample
 * @private
 */
export function attachLoadingQueue(dir, loadQueue, arr = [], type, filesMap, reSample?: boolean) {
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];

    const uri = item.uri;
    if (!uri) return;
    let data;
    let url = path.isRelativePath(item.uri) ? path.join(dir, item.uri) : item.uri;

    if (filesMap[uri]) url = filesMap[uri];
    else if (uri.substr(0, 5) === "data:") url = null;

    if (url || data)
      loadQueue[item.uri] = {
        type,
        props: {
          url,
          reSample,
          data
        }
      };
  }
}

/**
 * 载入 loader 中已存在的 technique
 * @param resource
 * @param resources
 * @private
 */
export function attachAsset(resource, resources) {
  resource.asset = {
    techniques: [], // RenderTechnique array
    textures: [], // Texture2D array
    meshes: [], // Mesh array
    skins: [], // Skin array
    materials: [], // Material array
    animations: [], // AnimationClip array
    scenes: [], // Scene array
    nodes: [],
    rootScene: {}
  };

  // attach preload techniques
  const techniques = resources.technique || [];
  for (let i = 0; i < techniques.length; i++) {
    const technique = techniques[i];

    resource.asset.techniques.push(technique.asset);
  }
}
