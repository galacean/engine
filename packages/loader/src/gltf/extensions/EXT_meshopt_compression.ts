import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IEXTMeshoptCompressionSchema } from "./GLTFExtensionSchema";
import { getMeshoptDecoder } from "./MeshoptDecoder";

@registerGLTFExtension("EXT_meshopt_compression", GLTFExtensionMode.CreateAndParse)
class EXT_meshopt_compression extends GLTFExtensionParser {
  override createAndParse(context: GLTFParserContext, schema: IEXTMeshoptCompressionSchema): Promise<Uint8Array> {
    return context.get<ArrayBuffer>(GLTFParserType.Buffer, schema.buffer).then((arrayBuffer) => {
      return getMeshoptDecoder().then((decoder) =>
        decoder.decodeGltfBuffer(
          schema.count,
          schema.byteStride,
          new Uint8Array(arrayBuffer, schema.byteOffset, schema.byteLength),
          schema.mode,
          schema.filter
        )
      );
    });
  }
}

declare module "@galacean/engine-core" {
  interface EngineConfiguration {
    /** glTF loader options. */
    glTF?: {
      /** Meshopt options. If set this option and workCount is great than 0, workers will be created. */
      meshOpt?: {
        /** Worker count for transcoder, default is 4. */
        workerCount: number;
      };
    };
  }
}
