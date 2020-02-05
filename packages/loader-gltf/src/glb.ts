import { parseGLTF } from "./glTF";
import { decodeText } from "./Util";
import { getBufferData, attachAsset } from "./Util";

/**
 * 解析 glb 格式
 * @param glb 二进制数据
 * @returns Object glb 中 glTF 信息与 bin 信息
 * @private
 */
export function parseGLB(glb) {
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
  const gltf = JSON.parse(decodeText(glTFData));

  // read all buffers
  const buffers = [];
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

  // start parse glTF
  return {
    gltf,
    buffers
  };
}

class GLBHandler {
  /**
   * 实现 handler 的 load 方法， glb 仅需加载 bin 资源与 imageBuffer,base64
   * @param request 请求库
   * @param props 资源配置
   * @param callback 加载成功回调
   */
  load(request, props, callback) {
    const data = {
      images: [],
      gltf: {} as any,
      buffers: [],
      shaders: []
    };

    request.load("binary", props, function(err, bin) {
      if (!err) {
        // load images and shaders
        const res = parseGLB(bin);
        data.gltf = res.gltf;
        data.buffers = res.buffers;

        const loadQueue = {};
        let counter = 0;

        const images = data.gltf.images || [];

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const uri = img.uri;

          if (uri) {
            //base64
            if (uri.substr(0, 5) === "data:") {
              const img = new Image();
              img.src = uri;
              data.images[i] = img;
            } else {
              //url
              //glb不支持url形式,如果后期有拓展再加
            }
          } else {
            // bufferView
            const bufferView = data.gltf.bufferViews[img.bufferView];
            const bufferData = getBufferData(bufferView, res.buffers);

            loadQueue[i] = {
              type: "imageBuffer",
              props: {
                imageBuffer: bufferData,
                type: img.mimeType || "image/jpeg"
              }
            };
          }

          counter++;
        }

        // 逸瞻：增加对glb文件中shader的解析支持
        const shaders = data.gltf.shaders || [];

        for (let i = 0; i < shaders.length; i++) {
          const shader = shaders[i];
          const bufferView = data.gltf.bufferViews[shader.bufferView];
          const bufferData = getBufferData(bufferView, res.buffers);

          loadQueue[counter] = {
            type: "shaderBuffer",
            props: {
              shaderBuffer: bufferData,
              type: "text/plain"
            }
          };
          counter++;
        }

        request.loadAll(loadQueue, function(err, resMap) {
          for (const res in resMap) {
            if (resMap[res] instanceof Image) {
              data.images[res] = resMap[res];
            } else {
              data.shaders.push(resMap[res]);
            }
          }

          callback(null, data);
        });
      } else {
        callback("Error loading GLB from " + props.url);
      }
    });
  }

  /**
   * 在 loader 所有资源加载完成后做处理
   * @param resource 当前资源
   * @param resources loader 加载的所有资源
   */
  // load & use engine exist resources
  patch(resource, resources) {
    // init asset info
    attachAsset(resource, resources);
  }

  /**
   * 实例化该资源
   * @param resource
   */
  open(resource) {
    // start parse glTF json
    parseGLTF(resource);
  }
}

export { GLBHandler };
