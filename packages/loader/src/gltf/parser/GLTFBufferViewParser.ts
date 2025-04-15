import { AssetPromise } from "@galacean/engine-core";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.BufferView)
export class GLTFBufferViewParser extends GLTFParser {
  parse(context: GLTFParserContext, index: number): AssetPromise<Uint8Array> {
    const bufferView = context.glTF.bufferViews[index];
    const { extensions, byteOffset = 0, byteLength, buffer: bufferIndex } = bufferView;
    return extensions
      ? <AssetPromise<Uint8Array>>GLTFParser.executeExtensionsCreateAndParse(extensions, context, bufferView)
      : context
          .get<ArrayBuffer>(GLTFParserType.Buffer, bufferIndex)
          .then((buffer) => new Uint8Array(buffer, byteOffset, byteLength));
  }
}
