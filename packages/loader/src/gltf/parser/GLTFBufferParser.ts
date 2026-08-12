import { AssetPromise, RequestConfig, Utils } from "@galacean/engine-core";
import { BufferRequestInfo } from "../../GLTFContentRestorer";
import type { IBuffer } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Buffer)
export class GLTFBufferParser extends GLTFParser {
  parse(context: GLTFParserContext, index: number): AssetPromise<ArrayBuffer> {
    const buffers = context.glTF.buffers;

    return context.buffers
      ? AssetPromise.resolve(context.buffers[index])
      : this._parseSingleBuffer(context, buffers[index]);
  }

  private _parseSingleBuffer(context: GLTFParserContext, bufferInfo: IBuffer): AssetPromise<ArrayBuffer> {
    const { glTFResource, contentRestorer, resourceManager } = context;
    const url = glTFResource.url;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };
    const bufferPath = Utils.resolveAbsoluteUrl(url, bufferInfo.uri);

    restoreBufferRequests.push(new BufferRequestInfo(bufferPath, requestConfig));
    const promise = resourceManager
      // @ts-ignore
      ._request<ArrayBuffer>(bufferPath, requestConfig)
      .onProgress(undefined, context._onTaskDetail);

    context._addTaskCompletePromise(promise);
    return promise;
  }
}
