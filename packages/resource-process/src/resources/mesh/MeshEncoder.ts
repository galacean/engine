import { BufferWriter } from "../../utils/BufferWriter";
import { encoder } from "../../utils/Decorator";
import { IVector3 } from "../prefab/PrefabDesign";
import { IColor, IEncodedModelMesh, IModelMesh, IVector2, IVector4 } from "./IModelMesh";

@encoder("Mesh")
export class MeshEncoder {
  static encode(bufferWriter: BufferWriter, data: IModelMesh): void {
    const vertexCount = data.positions.length;
    let offset = vertexCount * 3 * 4;
    const jsonData: IEncodedModelMesh = {
      positions: {
        start: 0,
        end: offset
      },
      subMeshes: data.subMeshes
    };
    if (data.normals) {
      jsonData.normals = {
        start: offset,
        end: (offset += vertexCount * 3 * 4)
      };
    }
    if (data.uvs) {
      jsonData.uvs = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.uv1) {
      jsonData.uv1 = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.uv2) {
      jsonData.uv2 = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.uv3) {
      jsonData.uv3 = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.uv4) {
      jsonData.uv4 = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.uv5) {
      jsonData.uv5 = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.uv6) {
      jsonData.uv6 = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.uv7) {
      jsonData.uv7 = {
        start: offset,
        end: (offset += vertexCount * 2 * 4)
      };
    }
    if (data.colors) {
      jsonData.colors = {
        start: offset,
        end: (offset += vertexCount * 4 * 4)
      };
    }
    if (data.boneIndices) {
      jsonData.boneIndices = {
        start: offset,
        end: (offset += vertexCount * 4 * 4)
      };
    }
    if (data.boneWeights) {
      jsonData.boneWeights = {
        start: offset,
        end: (offset += vertexCount * 4 * 4)
      };
    }
    if (data.blendShapes) {
      jsonData.blendShapes = data.blendShapes.map((blendShape) => {
        return {
          name: blendShape.name,
          frames: blendShape.frames.map((frame) => {
            const blendShapeData: any = {
              weight: frame.weight,
              deltaPosition: {
                start: offset,
                end: (offset += vertexCount * 3 * 4)
              }
            };
            frame.deltaNormals &&
              (blendShapeData.deltaNormals = {
                start: offset,
                end: (offset += vertexCount * 3 * 4)
              });
            frame.deltaTangents &&
              (blendShapeData.deltaTangents = {
                start: offset,
                end: (offset += vertexCount * 4 * 4)
              });
            return blendShapeData;
          })
        };
      });
    }
    const float32Array = new Float32Array(offset / 4);
    let arrayOffset = 0;
    vector3ArrayToFloat32Array(float32Array, data.positions, arrayOffset);
    arrayOffset += vertexCount * 3;
    if (data.normals) {
      vector3ArrayToFloat32Array(float32Array, data.normals, arrayOffset);
      arrayOffset += vertexCount * 3;
    }
    if (data.uvs) {
      vector2ArrayToFloat32Array(float32Array, data.uvs, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.uv1) {
      vector2ArrayToFloat32Array(float32Array, data.uv1, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.uv2) {
      vector2ArrayToFloat32Array(float32Array, data.uv2, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.uv3) {
      vector2ArrayToFloat32Array(float32Array, data.uv3, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.uv4) {
      vector2ArrayToFloat32Array(float32Array, data.uv4, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.uv5) {
      vector2ArrayToFloat32Array(float32Array, data.uv5, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.uv6) {
      vector2ArrayToFloat32Array(float32Array, data.uv6, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.uv7) {
      vector2ArrayToFloat32Array(float32Array, data.uv7, arrayOffset);
      arrayOffset += vertexCount * 2;
    }
    if (data.colors) {
      colorArrayToFloat32Array(float32Array, data.colors, arrayOffset);
      arrayOffset += vertexCount * 4;
    }
    if (data.boneIndices) {
      vector4ArrayToFloat32Array(float32Array, data.boneIndices, arrayOffset);
      arrayOffset += vertexCount * 4;
    }
    if (data.boneWeights) {
      vector4ArrayToFloat32Array(float32Array, data.boneWeights, arrayOffset);
      arrayOffset += vertexCount * 4;
    }
    if (data.blendShapes) {
      for (const blendShape of data.blendShapes) {
        for (const frame of blendShape.frames) {
          vector3ArrayToFloat32Array(float32Array, frame.deltaPositions, arrayOffset);
          arrayOffset += vertexCount * 3;
          if (frame.deltaNormals) {
            vector3ArrayToFloat32Array(float32Array, frame.deltaNormals, arrayOffset);
            arrayOffset += vertexCount * 3;
          }
          if (frame.deltaTangents) {
            vector4ArrayToFloat32Array(float32Array, frame.deltaTangents, arrayOffset);
            arrayOffset += vertexCount * 4;
          }
        }
      }
    }
    let indices: Uint16Array | Uint32Array = null;
    if (data.indices) {
      let type = 0;
      if (vertexCount > 65535) {
        type = 1;
        indices = new Uint32Array(data.indices);
      } else {
        indices = new Uint16Array(data.indices);
      }

      let byteLength = type === 0 ? Uint16Array.BYTES_PER_ELEMENT : Uint32Array.BYTES_PER_ELEMENT;
      jsonData.indices = {
        type,
        start: offset,
        end: (offset += data.indices.length * byteLength)
      };
    }
    bufferWriter.writeStr(JSON.stringify(jsonData));
    const completeOffset = Math.ceil(bufferWriter.offset / 4) * 4 - bufferWriter.offset;
    if (completeOffset > 0) {
      bufferWriter.writeArrayBuffer(new ArrayBuffer(completeOffset));
    }
    bufferWriter.writeArrayBuffer(float32Array.buffer);
    if (jsonData.indices) {
      bufferWriter.writeArrayBuffer(indices.buffer);
    }
  }
}

function vector3ArrayToFloat32Array(float32Array: Float32Array, vector3: IVector3[], offset: number): void {
  let array = new Array(3 * vector3.length);
  for (let i = 0; i < vector3.length; i++) {
    array[i * 3] = vector3[i].x;
    array[i * 3 + 1] = vector3[i].y;
    array[i * 3 + 2] = vector3[i].z;
  }
  float32Array.set(array, offset);
}

function vector2ArrayToFloat32Array(float32Array: Float32Array, vector2: IVector2[], offset: number): void {
  let array = new Array(2 * vector2.length);
  for (let i = 0; i < vector2.length; i++) {
    array[i * 2] = vector2[i].x;
    array[i * 2 + 1] = vector2[i].y;
  }
  float32Array.set(array, offset);
}

function vector4ArrayToFloat32Array(float32Array: Float32Array, vector4: IVector4[], offset: number): void {
  let array = new Array(4 * vector4.length);
  for (let i = 0; i < vector4.length; i++) {
    array[i * 4] = vector4[i].x;
    array[i * 4 + 1] = vector4[i].y;
    array[i * 4 + 2] = vector4[i].z;
    array[i * 4 + 3] = vector4[i].w;
  }
  float32Array.set(array, offset);
}

function colorArrayToFloat32Array(float32Array: Float32Array, color: IColor[], offset: number): void {
  let array = new Array(4 * color.length);
  for (let i = 0; i < color.length; i++) {
    array[i * 4] = color[i].r;
    array[i * 4 + 1] = color[i].g;
    array[i * 4 + 2] = color[i].b;
    array[i * 4 + 3] = color[i].a;
  }
  float32Array.set(array, offset);
}
