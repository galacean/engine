import { AssetPromise, request } from "@oasis-engine/core";
import { GLTFUtil } from "../GLTFUtil";
import { IBuffer, IGLTF } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFBufferParser extends GLTFParser {
  parse(context: GLTFParserContext): AssetPromise<void> {
    const glTFResource = context.glTFResource;
    const { url } = glTFResource;

    if (this._isGLB(url)) {
      return request<ArrayBuffer>(url, { type: "arraybuffer" })
        .then(GLTFUtil.parseGLB)
        .then(({ gltf, buffers }) => {
          context.gltf = gltf;
          context.buffers = buffers;
        });
    } else {
      return request(url, {
        type: "json"
      }).then((gltf: IGLTF) => {
        context.gltf = gltf;
        return Promise.all(
          gltf.buffers.map((buffer: IBuffer) => {
            return request<ArrayBuffer>(GLTFUtil.parseRelativeUrl(url, buffer.uri), { type: "arraybuffer" });
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
