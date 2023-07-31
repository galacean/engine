import { request, Utils } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { BufferRequestInfo } from "../../GLTFContentRestorer";
import type { IBuffer } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Buffer)
export class GLTFBufferParser extends GLTFParser {
  parse(context: GLTFParserContext, index?: number): Promise<ArrayBuffer | ArrayBuffer[]> {
    const { glTFResource, contentRestorer, glTF, _cache } = context;
    const url = glTFResource.url;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };

    if (!restoreBufferRequests.length) {
      glTF.buffers.forEach((buffer: IBuffer) => {
        const absoluteUrl = Utils.resolveAbsoluteUrl(url, buffer.uri);
        restoreBufferRequests.push(new BufferRequestInfo(absoluteUrl, requestConfig));
      });
    }

    const cacheKey = `${GLTFParserType.Buffer}:${index}`;
    let promise: Promise<ArrayBuffer | ArrayBuffer[]> = _cache.get(cacheKey);

    if (!promise) {
      if (context._buffers) {
        promise = Promise.resolve(index === undefined ? context._buffers : context._buffers[index]);
      } else {
        if (index === undefined) {
          promise = Promise.all(
            glTF.buffers.map((buffer: IBuffer) => {
              const absoluteUrl = Utils.resolveAbsoluteUrl(url, buffer.uri);
              return request<ArrayBuffer>(absoluteUrl, requestConfig);
            })
          );
        } else {
          const buffer = glTF.buffers[index];
          const absoluteUrl = Utils.resolveAbsoluteUrl(url, buffer.uri);
          promise = request<ArrayBuffer>(absoluteUrl, requestConfig);
        }
      }

      _cache.set(cacheKey, promise);
    }

    return promise;
  }
}
