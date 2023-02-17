import { AssetPromise, request } from "@oasis-engine/core";
import { RequestConfig } from "@oasis-engine/core/types/asset/request";
import { BufferRequestInfo } from "../../GLTFLoader";
import { GLTFUtil } from "../GLTFUtil";
import { IBuffer, IGLTF } from "../Schema";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class BufferParser extends Parser {
  parse(context: ParserContext): AssetPromise<void> {
    const glTFResource = context.glTFResource;
    const { url } = glTFResource;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };

    const isGLB = this._isGLB(url);
    context.contentRestoreInfo.isGLB = isGLB;

    if (isGLB) {
      return request<ArrayBuffer>(url, requestConfig)
        .then((glb) => {
          context.contentRestoreInfo.bufferRequests.push(new BufferRequestInfo(url, requestConfig));
          return GLTFUtil.parseGLB(context, glb, requestConfig);
        })
        .then(({ gltf, buffers }) => {
          context.gltf = gltf;
          context.buffers = buffers;
        });
    } else {
      return request(url, {
        type: "json"
      }).then((gltf: IGLTF) => {
        context.gltf = gltf;
        const restoreBufferRequests = context.contentRestoreInfo.bufferRequests;
        return Promise.all(
          gltf.buffers.map((buffer: IBuffer) => {
            const absoluteUrl = GLTFUtil.parseRelativeUrl(url, buffer.uri);
            restoreBufferRequests.push(new BufferRequestInfo(absoluteUrl, requestConfig));
            return request<ArrayBuffer>(GLTFUtil.parseRelativeUrl(absoluteUrl, buffer.uri), requestConfig);
          })
        ).then((buffers: ArrayBuffer[]) => {
          context.buffers = buffers;
        });
      });
    }
  }

  private _isGLB(url: string): boolean {
    const index = url.lastIndexOf(".");
    return url.substring(index + 1, index + 4) === "glb";
  }
}
