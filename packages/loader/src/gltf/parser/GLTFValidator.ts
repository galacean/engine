import { AssetPromise, Logger } from "@galacean/engine-core";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext } from "./GLTFParserContext";

export class GLTFValidator extends GLTFParser {
  parse(context: GLTFParserContext): AssetPromise<void> {
    const {
      asset: { version },
      extensionsUsed,
      extensionsRequired
    } = context.gltf;

    const gltfVersion = Number(version);
    if (!(gltfVersion >= 2 && gltfVersion < 3)) {
      throw "Only support gltf 2.x.";
    }
    const promises = [];
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
        } else {
          promises.push(GLTFParser.executeExtensionsInitialize(extensionRequired));
        }
      }
    }

    return AssetPromise.all(promises).then(null);
  }
}
