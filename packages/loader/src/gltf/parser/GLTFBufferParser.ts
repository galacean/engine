import { AssetPromise, RequestConfig } from "@galacean/engine-core";
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
    const assetPath = glTFResource.url;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };
    // @ts-ignore
    const bufferAssetPath = resourceManager._resolveAssetPath(assetPath, bufferInfo.uri);

    restoreBufferRequests.push(new BufferRequestInfo(bufferAssetPath, requestConfig));
    const promise = resourceManager
      // @ts-ignore
      ._request<ArrayBuffer>(bufferAssetPath, requestConfig)
      .onProgress(undefined, context._onTaskDetail);

    context._addTaskCompletePromise(promise);
    return promise;
  }
}
