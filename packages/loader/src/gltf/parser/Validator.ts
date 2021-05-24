import { Logger } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { Parser } from "./Parser";

export class Validator extends Parser {
  parse(context: GLTFResource): void {
    const {
      gltf: {
        asset: { version },
        extensionsUsed,
        extensionsRequired
      }
    } = context;

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
