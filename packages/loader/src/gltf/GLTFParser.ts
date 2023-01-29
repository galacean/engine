import { AssetPromise } from "@oasis-engine/core";
import { GLTFResource } from "./GLTFResource";
import { AnimationParser } from "./parser/AnimationParser";
import { BufferParser } from "./parser/BufferParser";
import { EntityParser } from "./parser/EntityParser";
import { MaterialParser } from "./parser/MaterialParser";
import { MeshParser } from "./parser/MeshParser";
import { Parser } from "./parser/Parser";
import { ParserContext } from "./parser/ParserContext";
import { SceneParser } from "./parser/SceneParser";
import { SkinParser } from "./parser/SkinParser";
import { TextureParser } from "./parser/TextureParser";
import { Validator } from "./parser/Validator";

export class GLTFParser {
  static defaultPipeline = new GLTFParser([
    BufferParser,
    Validator,
    TextureParser,
    MaterialParser,
    MeshParser,
    EntityParser,
    SkinParser,
    AnimationParser,
    SceneParser
  ]);

  private _pipes: Parser[] = [];

  private constructor(pipes: (new () => Parser)[]) {
    pipes.forEach((pipe: new () => Parser, index: number) => {
      this._pipes[index] = new pipe();
    });
  }

  parse(context: ParserContext): AssetPromise<GLTFResource> {
    const glTFResource = context.glTFResource;
    let lastPipe;

    return new AssetPromise<GLTFResource>((resolve, reject) => {
      this._pipes.forEach((parser: Parser) => {
        if (lastPipe) {
          lastPipe = lastPipe.then(() => {
            return parser.parse(context);
          });
          if (lastPipe.cancel) {
            context.chainPromises.push(lastPipe);
          }
        } else {
          lastPipe = parser.parse(context);
        }
      });

      if (lastPipe) {
        lastPipe
          .then(() => {
            resolve(glTFResource);
          })
          .catch(reject);
      }
    });
  }
}
