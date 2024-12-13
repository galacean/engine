import { RequestConfig, Utils } from "@galacean/engine-core";
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
    const { glTFResource, contentRestorer, resourceManager } = context;
    const url = glTFResource.url;
    // @ts-ignore
    const remoteUrl = resourceManager._getRemoteUrl(url);
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };
    const absoluteUrl = Utils.resolveAbsoluteUrl(remoteUrl, bufferInfo.uri);

    restoreBufferRequests.push(new BufferRequestInfo(absoluteUrl, requestConfig));
    const promise = resourceManager
      // @ts-ignore
      ._requestByRemoteUrl<ArrayBuffer>(absoluteUrl, requestConfig)
      .onProgress(undefined, context._onTaskDetail);

    context._addTaskCompletePromise(promise);
    return promise;
  }
}
