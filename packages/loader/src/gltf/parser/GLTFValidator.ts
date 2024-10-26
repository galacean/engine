import { Logger } from "@galacean/engine-core";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Validator)
export class GLTFValidator extends GLTFParser {
  parse(context: GLTFParserContext): Promise<void> {
    const {
      asset: { version },
      extensionsUsed,
      extensionsRequired
    } = context.glTF;

    const glTFVersion = Number(version);
    if (!(glTFVersion >= 2 && glTFVersion < 3)) {
      throw "Only support glTF 2.x.";
    }

    if (extensionsUsed) {
      Logger.info("extensionsUsed: ", extensionsUsed);
      for (let i = 0; i < extensionsUsed.length; i++) {
        const extensionUsed = extensionsUsed[i];
        if (!GLTFParser.hasExtensionParser(extensionUsed)) {
          Logger.warn(`Extension ${extensionUsed} is not implemented, you can customize this extension in gltf.`);
        }
      }
    }

    if (extensionsRequired) {
      Logger.info(`extensionsRequired: ${extensionsRequired}`);
      for (let i = 0; i < extensionsRequired.length; i++) {
        const extensionRequired = extensionsRequired[i];

        if (!GLTFParser.hasExtensionParser(extensionRequired)) {
          Logger.error(`GLTF parser has not supported required extension ${extensionRequired}.`);
        }
      }
    }

    return Promise.resolve(null);
  }
}
