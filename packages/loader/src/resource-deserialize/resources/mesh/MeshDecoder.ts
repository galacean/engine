import type { Engine } from "@galacean/engine-core";
import { BlendShape, ModelMesh } from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { BufferReader } from "../../utils/BufferReader";
import { decoder } from "../../utils/Decorator";
import type { IEncodedModelMesh } from "./IModelMesh";

/**
 * @todo refactor
 */
@decoder("Mesh")
export class MeshDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): Promise<ModelMesh> {
    return new Promise((resolve) => {
      const modelMesh = new ModelMesh(engine);
      const jsonDataString = bufferReader.nextStr();
      const encodedMeshData: IEncodedModelMesh = JSON.parse(jsonDataString);

      // @ts-ignore Vector3 is not compatible with {x: number, y: number, z: number}.
      encodedMeshData.bounds && modelMesh.bounds.copyFrom(encodedMeshData.bounds);

      const offset = Math.ceil(bufferReader.offset / 4) * 4;

      const float32Array = new Float32Array(
        bufferReader.buffer,
        encodedMeshData.positions.start + offset,
        (encodedMeshData.positions.end - encodedMeshData.positions.start) / 4
      );
      const vertexCount = float32Array.length / 3;
      const positions = float32ArrayToVector3(float32Array, vertexCount);
      modelMesh.setPositions(positions);
      if (encodedMeshData.normals) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.normals.start + offset,
          (encodedMeshData.normals.end - encodedMeshData.normals.start) / 4
        );
        const normals = float32ArrayToVector3(float32Array, vertexCount);
        modelMesh.setNormals(normals);
      }
      if (encodedMeshData.uvs) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uvs.start + offset,
          (encodedMeshData.uvs.end - encodedMeshData.uvs.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount));
      }
      if (encodedMeshData.uv1) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uv1.start + offset,
          (encodedMeshData.uv1.end - encodedMeshData.uv1.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount), 1);
      }
      if (encodedMeshData.uv2) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uv2.start + offset,
          (encodedMeshData.uv2.end - encodedMeshData.uv2.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount), 2);
      }
      if (encodedMeshData.uv3) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uv3.start + offset,
          (encodedMeshData.uv3.end - encodedMeshData.uv3.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount), 3);
      }
      if (encodedMeshData.uv4) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uv4.start + offset,
          (encodedMeshData.uv4.end - encodedMeshData.uv4.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount), 4);
      }
      if (encodedMeshData.uv5) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uv5.start + offset,
          (encodedMeshData.uv5.end - encodedMeshData.uv5.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount), 5);
      }
      if (encodedMeshData.uv6) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uv6.start + offset,
          (encodedMeshData.uv6.end - encodedMeshData.uv6.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount), 6);
      }
      if (encodedMeshData.uv7) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.uv7.start + offset,
          (encodedMeshData.uv7.end - encodedMeshData.uv7.start) / 4
        );
        modelMesh.setUVs(float32ArrayToVector2(float32Array, vertexCount), 7);
      }
      if (encodedMeshData.colors) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.colors.start + offset,
          (encodedMeshData.colors.end - encodedMeshData.colors.start) / 4
        );
        modelMesh.setColors(float32ArrayToVColor(float32Array, vertexCount));
      }
      if (encodedMeshData.boneWeights) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.boneWeights.start + offset,
          (encodedMeshData.boneWeights.end - encodedMeshData.boneWeights.start) / 4
        );
        modelMesh.setBoneWeights(float32ArrayToVector4(float32Array, vertexCount));
      }
      if (encodedMeshData.boneIndices) {
        const float32Array = new Float32Array(
          bufferReader.buffer,
          encodedMeshData.boneIndices.start + offset,
          (encodedMeshData.boneIndices.end - encodedMeshData.boneIndices.start) / 4
        );
        modelMesh.setBoneIndices(float32ArrayToVector4(float32Array, vertexCount));
      }
      if (encodedMeshData.blendShapes) {
        encodedMeshData.blendShapes.forEach((blendShapeData) => {
          const blendShape = new BlendShape(blendShapeData.name);
          blendShapeData.frames.forEach((frameData) => {
            const positionArray = new Float32Array(
              bufferReader.buffer,
              frameData.deltaPosition.start + offset,
              (frameData.deltaPosition.end - frameData.deltaPosition.start) / 4
            );
            const count = positionArray.length / 3;
            const deltaPosition = float32ArrayToVector3(positionArray, count);
            let deltaNormals: Vector3[] | null = null;
            if (frameData.deltaNormals) {
              const normalsArray = new Float32Array(
                bufferReader.buffer,
                frameData.deltaNormals.start + offset,
                (frameData.deltaNormals.end - frameData.deltaNormals.start) / 4
              );
              deltaNormals = float32ArrayToVector3(normalsArray, count);
            }
            let deltaTangents: Vector4[] | null = null;
            if (frameData.deltaTangents) {
              const tangentsArray = new Float32Array(
                bufferReader.buffer,
                frameData.deltaTangents.start + offset,
                (frameData.deltaTangents.end - frameData.deltaTangents.start) / 4
              );
              deltaTangents = float32ArrayToVector4(tangentsArray, count);
            }
            blendShape.addFrame(frameData.weight, deltaPosition);
          });
          modelMesh.addBlendShape(blendShape);
        });
      }
      if (encodedMeshData.indices) {
        let indices: Uint16Array | Uint32Array = null;
        if (encodedMeshData.indices.type === 0) {
          indices = new Uint16Array(
            bufferReader.buffer,
            encodedMeshData.indices.start + offset,
            (encodedMeshData.indices.end - encodedMeshData.indices.start) / 2
          );
        } else {
          indices = new Uint32Array(
            bufferReader.buffer,
            encodedMeshData.indices.start + offset,
            (encodedMeshData.indices.end - encodedMeshData.indices.start) / 4
          );
        }
        modelMesh.setIndices(indices);
      }

      encodedMeshData.subMeshes.forEach((subMesh) => modelMesh.addSubMesh(subMesh));
      modelMesh.uploadData(false);
      resolve(modelMesh);
    });
  }
}

function float32ArrayToVColor(float32Array: Float32Array, vertexCount: number) {
  const array = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    array[i] = new Color(
      float32Array[i * 4],
      float32Array[i * 4 + 1],
      float32Array[i * 4 + 2],
      float32Array[i * 4 + 3]
    );
  }
  return array;
}

function float32ArrayToVector4(float32Array: Float32Array, vertexCount: number) {
  const array = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    array[i] = new Vector4(
      float32Array[i * 4],
      float32Array[i * 4 + 1],
      float32Array[i * 4 + 2],
      float32Array[i * 4 + 3]
    );
  }
  return array;
}

function float32ArrayToVector3(float32Array: Float32Array, vertexCount: number) {
  const array = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    array[i] = new Vector3(float32Array[i * 3], float32Array[i * 3 + 1], float32Array[i * 3 + 2]);
  }
  return array;
}

function float32ArrayToVector2(float32Array: Float32Array, vertexCount: number) {
  const array = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    array[i] = new Vector2(float32Array[i * 2], float32Array[i * 2 + 1]);
  }
  return array;
}
