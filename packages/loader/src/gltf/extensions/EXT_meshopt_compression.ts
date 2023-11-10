import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext, GLTFParserType } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { MeshoptDecoder } from "./MeshoptDecoder";

interface MeshOptSchema {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride: number;
  mode: "ATTRIBUTES" | "TRIANGLES" | "INDICES";
  count: number;
  filter: "NONE" | "OCTAHEDRAL" | "QUATERNION" | "EXPONENTIAL";
}

@registerGLTFExtension("EXT_meshopt_compression", GLTFExtensionMode.CreateAndParse)
class EXT_meshopt_compression extends GLTFExtensionParser {
  override createAndParse(context: GLTFParserContext, schema: MeshOptSchema): Promise<Uint8Array> {
    const { count, byteStride, mode, filter, buffer, byteLength, byteOffset } = schema;
    return context.get<ArrayBuffer>(GLTFParserType.Buffer, buffer).then((arrayBuffer) => {
      return MeshoptDecoder.decodeGltfBuffer(
        count,
        byteStride,
        new Uint8Array(arrayBuffer, byteOffset, byteLength),
        mode,
        filter
      );
    });
  }
}
