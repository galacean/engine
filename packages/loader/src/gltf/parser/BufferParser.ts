import { AssetType } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { IBuffer, IGLTF } from "../Schema";
import { GLTFUtil } from "../GLTFUtil";
import { Parser } from "./Parser";

export class BufferParser extends Parser {
  parse(context: GLTFResource): Promise<void> {
    const { url, engine } = context;

    if (this._isGLB(url)) {
      return engine.resourceManager
        .load<ArrayBuffer>({
          url,
          type: AssetType.Buffer
        })
        .then(GLTFUtil.parseGLB)
        .then(({ gltf, buffers }) => {
          context.gltf = gltf;
          context.buffers = buffers;
        });
    } else {
      return engine.resourceManager
        .load<IGLTF>({
          url,
          type: AssetType.JSON
        })
        .then((gltf: IGLTF) => {
          context.gltf = gltf;
          return Promise.all(
            gltf.buffers.map((buffer: IBuffer) => {
              return engine.resourceManager.load<ArrayBuffer>({
                type: AssetType.Buffer,
                url: GLTFUtil.parseRelativeUrl(url, buffer.uri)
              });
            })
          ).then((buffers: ArrayBuffer[]) => {
            context.buffers = buffers;
          });
        });
    }
  }

  private _isGLB(url: string): boolean {
    return url.substring(url.lastIndexOf(".") + 1) === "glb";
  }
}
