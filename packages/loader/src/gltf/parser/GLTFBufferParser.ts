import { AssetPromise, request, Utils } from "@galacean/engine-core";
import { RequestConfig } from "@galacean/engine-core/types/asset/request";
import { BufferRequestInfo } from "../../GLTFContentRestorer";
import type { IBuffer, IGLTF } from "../GLTFSchema";
import { GLTFUtils } from "../GLTFUtils";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFBufferParser extends GLTFParser {
  parse(context: GLTFParserContext): AssetPromise<void> {
    const { glTFResource, contentRestorer } = context;
    const { url } = glTFResource;
    const restoreBufferRequests = contentRestorer.bufferRequests;
    const requestConfig = <RequestConfig>{ type: "arraybuffer" };
    const isGLB = this._isGLB(url);

    contentRestorer.isGLB = isGLB;
    if (isGLB) {
      return request<ArrayBuffer>(url, requestConfig)
        .then((glb) => {
          restoreBufferRequests.push(new BufferRequestInfo(url, requestConfig));
          return GLTFUtils.parseGLB(context, glb);
        })
        .then(({ glTF, buffers }) => {
          context.glTF = glTF;
          context.buffers = buffers;
        });
    } else {
      return request(url, {
        type: "json"
      }).then((glTF: IGLTF) => {
        context.glTF = glTF;
        const { images, textures } = glTF;

        const buffersPromise = Promise.all(
          glTF.buffers.map((buffer: IBuffer) => {
            const absoluteUrl = Utils.resolveAbsoluteUrl(url, buffer.uri);
            restoreBufferRequests.push(new BufferRequestInfo(absoluteUrl, requestConfig));
            return request<ArrayBuffer>(absoluteUrl, requestConfig);
          })
        ).then((buffers: ArrayBuffer[]) => {
          context.buffers = buffers;
        });
        // If the textures are all urls, process `GLTFBufferParser` and `GLTFTextureParser` pipelines in parallel.
        for (let i in textures) {
          if (!images[textures[i].source].uri) {
            return buffersPromise;
          }
        }
        context.buffersPromise = buffersPromise;
      });
    }
  }

  private _isGLB(url: string): boolean {
    const index = url.lastIndexOf(".");
    return url.substring(index + 1, index + 4) === "glb";
  }
}
