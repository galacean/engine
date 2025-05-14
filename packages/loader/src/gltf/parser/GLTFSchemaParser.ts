import { Utils, request } from "@galacean/engine-core";
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
    return request<ArrayBuffer>(url, requestConfig)
      .then((buffer) => {
        const parseResult = GLTFUtils.parseGLB(context, buffer);
        // If the buffer is a GLB file, we need to restore the buffer data
        if (parseResult?.glTF) {
          restoreBufferRequests.push(new BufferRequestInfo(url, requestConfig));
        }
        return parseResult;
      })
      .then((result) => {
        if (result?.glTF) {
          contentRestorer.isGLB = true;
          context.buffers = result.buffers;
          return result.glTF;
        } else {
          contentRestorer.isGLB = false;
          return JSON.parse(Utils.decodeText(new Uint8Array(result.originBuffer)));
        }
      });
  }
}
