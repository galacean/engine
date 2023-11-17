import { AssetPromise, request } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { BufferRequestInfo } from "../../GLTFContentRestorer";
import { IGLTF } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Schema)
export class GLTFSchemaParser extends GLTFParser {
  parse(context: GLTFParserContext): Promise<IGLTF> {
    const { glTFResource, contentRestorer } = context;
    const url = glTFResource.url;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };
    const isGLB = this._isGLB(url);

    contentRestorer.isGLB = isGLB;
    const promise: AssetPromise<IGLTF> = isGLB
      ? request<ArrayBuffer>(url, requestConfig)
          .onProgress((e) => {
            context._dispatchProgressEvent(e);
          })
          .then((glb) => {
            restoreBufferRequests.push(new BufferRequestInfo(url, requestConfig));
            return GLTFUtils.parseGLB(context, glb);
          })
          .then(({ glTF, buffers }) => {
            context.buffers = buffers;
            return glTF;
          })
      : request<IGLTF>(url, {
          type: "json"
        }).onProgress((e) => {
          context._dispatchProgressEvent(e);
        });

    return promise;
  }

  private _isGLB(url: string): boolean {
    const index = url.lastIndexOf(".");
    return url.substring(index + 1, index + 4) === "glb";
  }
}
