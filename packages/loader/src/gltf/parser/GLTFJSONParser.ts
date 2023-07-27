import { AssetPromise, request } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { BufferRequestInfo } from "../../GLTFContentRestorer";
import { IGLTF } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.JSON)
export class GLTFJSONParser extends GLTFParser {
  parse(context: GLTFParserContext): Promise<IGLTF> {
    const { glTFResource, contentRestorer } = context;
    const { url } = glTFResource;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };
    const isGLB = this._isGLB(url);

    contentRestorer.isGLB = isGLB;
    const promise: AssetPromise<IGLTF> = isGLB
      ? request<ArrayBuffer>(url, requestConfig)
          .then((glb) => {
            restoreBufferRequests.push(new BufferRequestInfo(url, requestConfig));
            return GLTFUtils.parseGLB(context, glb);
          })
          .then(({ glTF, buffers }) => {
            context._buffers = buffers;
            return glTF;
          })
      : request(url, {
          type: "json"
        });

    return Promise.resolve(promise);
  }

  private _isGLB(url: string): boolean {
    const index = url.lastIndexOf(".");
    return url.substring(index + 1, index + 4) === "glb";
  }
}
