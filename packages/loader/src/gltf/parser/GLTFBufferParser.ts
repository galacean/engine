import { AssetPromise, request, Utils } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { BufferRequestInfo } from "../../GLTFContentRestorer";
import type { IBuffer } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Buffer)
export class GLTFBufferParser extends GLTFParser {
  parse(context: GLTFParserContext, index?: number): Promise<ArrayBuffer | ArrayBuffer[]> {
    const { glTFResource, contentRestorer, glTF } = context;
    const { url } = glTFResource;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };

    if (!restoreBufferRequests.length) {
      glTF.buffers.forEach((buffer: IBuffer) => {
        const absoluteUrl = Utils.resolveAbsoluteUrl(url, buffer.uri);
        restoreBufferRequests.push(new BufferRequestInfo(absoluteUrl, requestConfig));
      });
    }

    if (context._buffers) {
      return Promise.resolve(index === undefined ? context._buffers : context._buffers[index]);
    } else {
      if (index === undefined) {
        return AssetPromise.all(
          glTF.buffers.map((buffer: IBuffer) => {
            const absoluteUrl = Utils.resolveAbsoluteUrl(url, buffer.uri);
            return request<ArrayBuffer>(absoluteUrl, requestConfig);
          })
        );
      } else {
        const buffer = glTF.buffers[index];
        const absoluteUrl = Utils.resolveAbsoluteUrl(url, buffer.uri);
        return request<ArrayBuffer>(absoluteUrl, requestConfig);
      }
    }
  }
}
