import { AssetType } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { IBuffer, IGLTF } from "../Schema";
import { GLTFUtil } from "../GLTFUtil";
import { Parser } from "./Parser";

export class BufferParser extends Parser {
  private static _isGLB(url: string): boolean {
    return url.substring(url.lastIndexOf(".") + 1) === "glb";
  }

  parse(context: GLTFResource): Promise<void> {
    const { url, engine } = context;

    if (BufferParser._isGLB(url)) {
      return engine.resourceManager
        .load<ArrayBuffer>({
          type: AssetType.Buffer,
          url
        })
        .then(GLTFUtil.parseGLB)
        .then(({ gltf, buffers }) => {
          context.gltf = gltf;
          context.buffers = buffers;
        });
    } else {
      return engine.resourceManager
        .load<IGLTF>({
          type: AssetType.JSON,
          url
        })
        .then((json: IGLTF) => {
          context.gltf = json;

          return Promise.all(
            json.buffers.map((item: IBuffer) => {
              return engine.resourceManager.load<ArrayBuffer>({
                type: AssetType.Buffer,
                url: GLTFUtil.parseRelativeUrl(url, item.uri)
              });
            })
          ).then((buffers: ArrayBuffer[]) => {
            context.buffers = buffers;
          });
        });
    }
  }
}
