import { GLTFResource } from "./GLTFResource";
import { BufferParser } from "./parser/BufferParser";
import { EntityParser } from "./parser/EntityParser";
import { MaterialParser } from "./parser/MaterialParser";
import { MeshParser } from "./parser/MeshParser";
import { Parser } from "./parser/Parser";
import { SceneParser } from "./parser/SceneParser";
import { TextureParser } from "./parser/TextureParser";
import { Validator } from "./parser/Validator";

/**
 * Parse skin.
 * @param gltfSkin
 * @param resources
 * @private
 */
// export function parseSkin(gltfSkin, resources) {
//   const { gltf, buffers } = resources;

//   const jointCount = gltfSkin.joints.length;

//   // FIXME: name is null
//   const skin = new Skin(gltfSkin.name);
//   // parse IBM
//   const accessor = gltf.accessors[gltfSkin.inverseBindMatrices];
//   const buffer = getAccessorData(gltf, accessor, buffers);
//   const MAT4_LENGTH = 16;

//   for (let i = 0; i < jointCount; i++) {
//     const startIdx = MAT4_LENGTH * i;
//     const endIdx = startIdx + MAT4_LENGTH;
//     skin.inverseBindMatrices[i] = new Matrix(...buffer.subarray(startIdx, endIdx));
//   }

//   // get joints
//   for (let i = 0; i < jointCount; i++) {
//     const node = getItemByIdx("nodes", gltfSkin.joints[i], resources);
//     skin.joints[i] = node.name;
//   }

//   // get skeleton
//   const node = getItemByIdx("nodes", gltfSkin.skeleton == null ? gltfSkin.joints[0] : gltfSkin.skeleton, resources);
//   skin.skeleton = node.name;

//   return Promise.resolve(skin);
// }

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
  EntityParser,
  SceneParser
]);
