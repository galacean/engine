import { registerGLTFParser, GLTFParserType, GLTFParserContext } from "./GLTFParserContext";
import { GLTFParser } from "./GLTFParser";

@registerGLTFParser(GLTFParserType.BufferView)
export class GLTFBufferViewParser extends GLTFParser {
  parse(context: GLTFParserContext, index: number): Promise<Uint8Array> {
    const bufferView = context.glTF.bufferViews[index];
    const { extensions, byteOffset = 0, byteLength, buffer } = bufferView;
    let bufferViewDataPromise: Promise<Uint8Array>;
    bufferViewDataPromise = extensions
      ? <Promise<Uint8Array>>GLTFParser.executeExtensionsCreateAndParse(extensions, context, bufferView)
      : context
          .get<ArrayBuffer>(GLTFParserType.Buffer)
          .then((buffers) => new Uint8Array(buffers[buffer], byteOffset, byteLength));
    return bufferViewDataPromise;
  }
}
