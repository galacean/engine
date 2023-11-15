import { request, Utils } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { BufferRequestInfo } from "../../GLTFContentRestorer";
import type { IBuffer } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Buffer)
export class GLTFBufferParser extends GLTFParser {
  parse(context: GLTFParserContext, index: number): Promise<ArrayBuffer> {
    const buffers = context.glTF.buffers;

    return context.buffers ? Promise.resolve(context.buffers[index]) : this._parseSingleBuffer(context, buffers[index]);
  }

  private _parseSingleBuffer(context: GLTFParserContext, bufferInfo: IBuffer): Promise<ArrayBuffer> {
    const { glTFResource, contentRestorer } = context;
    const url = glTFResource.url;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };
    const absoluteUrl = Utils.resolveAbsoluteUrl(url, bufferInfo.uri);

    restoreBufferRequests.push(new BufferRequestInfo(absoluteUrl, requestConfig));
    const promise = request<ArrayBuffer>(absoluteUrl, requestConfig).onProgress((e) => {
      context._addProgressEvent(e);
    });

    context._addProgressEvent(undefined, promise);
    return promise;
  }
}
