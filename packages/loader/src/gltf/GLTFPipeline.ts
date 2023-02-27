import { AssetPromise } from "@oasis-engine/core";
import { GLTFResource } from "./GLTFResource";
import { GLTFAnimationParser } from "./parser/GLTFAnimationParser";
import { GLTFBufferParser } from "./parser/GLTFBufferParser";
import { GLTFEntityParser } from "./parser/GLTFEntityParser";
import { GLTFMaterialParser } from "./parser/GLTFMaterialParser";
import { GLTFMeshParser } from "./parser/GLTFMeshParser";
import { GLTFParser } from "./parser/GLTFParser";
import { GLTFParserContext } from "./parser/GLTFParserContext";
import { GLTFSceneParser } from "./parser/GLTFSceneParser";
import { GLTFSkinParser } from "./parser/GLTFSkinParser";
import { GLTFTextureParser } from "./parser/GLTFTextureParser";
import { GLTFValidator } from "./parser/GLTFValidator";

export class GLTFPipeline {
  static defaultPipeline = new GLTFPipeline(
    GLTFBufferParser,
    GLTFValidator,
    GLTFTextureParser,
    GLTFMaterialParser,
    GLTFMeshParser,
    GLTFEntityParser,
    GLTFSkinParser,
    GLTFAnimationParser,
    GLTFSceneParser
  );

  private _parsers: GLTFParser[] = [];

  constructor(...parsers: (new () => GLTFParser)[]) {
    parsers.forEach((pipe: new () => GLTFParser, index: number) => {
      this._parsers[index] = new pipe();
    });
  }

  parse(context: GLTFParserContext): AssetPromise<GLTFResource> {
    const glTFResource = context.glTFResource;
    let lastParser;

    return new AssetPromise<GLTFResource>((resolve, reject) => {
      this._parsers.forEach((parser: GLTFParser) => {
        if (lastParser) {
          lastParser = lastParser.then(() => {
            return parser.parse(context);
          });
          if (lastParser.cancel) {
            context.chainPromises.push(lastParser);
          }
        } else {
          lastParser = parser.parse(context);
        }
      });

      if (lastParser) {
        lastParser
          .then(() => {
            resolve(glTFResource);
          })
          .catch(reject);
      }
    });
  }
}
