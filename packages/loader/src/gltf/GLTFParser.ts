import { GLTFResource } from "./GLTFResource";
import { AnimationParser } from "./parser/AnimationParser";
import { BufferParser } from "./parser/BufferParser";
import { EntityParser } from "./parser/EntityParser";
import { MaterialParser } from "./parser/MaterialParser";
import { MeshParser } from "./parser/MeshParser";
import { Parser } from "./parser/Parser";
import { SceneParser } from "./parser/SceneParser";
import { SkinParser } from "./parser/SkinParser";
import { TextureParser } from "./parser/TextureParser";
import { Validator } from "./parser/Validator";

export class GLTFParser {
  private static _isPromise(value: any): boolean {
    return value && typeof value.then === "function";
  }

  private _pipeline: Parser[] = [];

  constructor(pipeline: (new () => Parser)[]) {
    pipeline.forEach((Pipe: new () => Parser, index: number) => {
      this._pipeline[index] = new Pipe();
    });
  }

  parse(context: GLTFResource): Promise<GLTFResource> {
    let lastPipeOutput: void | Promise<void> = void 0;

    return new Promise((resolve, reject) => {
      this._pipeline.forEach((parser: Parser) => {
        if (GLTFParser._isPromise(lastPipeOutput)) {
          lastPipeOutput = (lastPipeOutput as Promise<void>).then(() => {
            return parser.parse(context);
          });
        } else {
          lastPipeOutput = parser.parse(context);
        }
      });

      if (GLTFParser._isPromise(lastPipeOutput)) {
        (lastPipeOutput as Promise<void>)
          .then(() => {
            resolve(context);
          })
          .catch(reject);
      } else {
        resolve(context);
      }
    });
  }
}

export const gltfParser = new GLTFParser([
  BufferParser,
  Validator,
  TextureParser,
  MaterialParser,
  MeshParser,
  SkinParser,
  AnimationParser,
  EntityParser,
  SceneParser
]);
