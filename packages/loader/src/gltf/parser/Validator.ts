import { Logger } from "@oasis-engine/core";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class Validator extends Parser {
  parse(context: ParserContext): void {
    const {
      asset: { version },
      extensionsUsed,
      extensionsRequired
    } = context.gltf;

    const gltfVersion = Number(version);
    if (!(gltfVersion >= 2 && gltfVersion < 3)) {
      throw "Only support gltf 2.x.";
    }

    if (extensionsUsed) {
      Logger.info("extensionsUsed: ", extensionsUsed);
      for (let i = 0; i < extensionsUsed.length; i++) {
        if (!Parser.hasExtensionParser(extensionsUsed[i])) {
          Logger.warn(`Extension ${extensionsUsed[i]} is not implemented, you can customize this extension in gltf.`);
        }
      }
    }

    if (extensionsRequired) {
      Logger.info(`extensionsRequired: ${extensionsRequired}`);
      for (let i = 0; i < extensionsRequired.length; i++) {
        const extensionRequired = extensionsRequired[i];

        if (!Parser.hasExtensionParser(extensionRequired)) {
          Logger.error(`GLTF parser has not supported required extension ${extensionRequired}.`);
        } else {
          Parser.initialize(extensionRequired);
        }
      }
    }
  }
}
