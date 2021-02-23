import { Engine, Material, ResourceManager, Shader, Texture } from "@oasis-engine/core";
import { ShaderData } from "@oasis-engine/core/types/shader/ShaderData";
import { Color, Matrix, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { BufferReader } from "./utils/BufferReader";

export class MaterialDecoder {
  public static decode(
    engine: Engine,
    arraybuffer: ArrayBuffer,
    byteOffset?: number,
    byteLength?: number
  ): Promise<Material> {
    return new Promise((resolve, reject) => {
      const bufferReader = new BufferReader(arraybuffer, byteOffset, byteLength);
      // init material
      const shader = bufferReader.nextStr();
      const renderQueueType = bufferReader.nextUint16();
      const materal = new Material(engine, Shader.find(shader));
      materal.renderQueueType = renderQueueType;

      // read shader data
      const len = bufferReader.nextUint8();
      const types = bufferReader.nextUint8Array(len);

      const { shaderData } = materal;
      const propertyNames = new Array(len);
      for (let i = 0; i < len; i++) {
        propertyNames[i] = bufferReader.nextStr();
      }

      const shaderDataSetPromises = new Array(len);
      for (let i = 0; i < len; i++) {
        const propertyName = propertyNames[i];
        const propertyType = types[i];
        shaderDataSetPromises[i] = this.setShaderDataByType(
          bufferReader,
          shaderData,
          propertyName,
          propertyType,
          engine.resourceManager
        );
      }

      const macroLen = bufferReader.nextUint8();
      for (let i = 0; i < macroLen; i++) {
        const enabledMacro = bufferReader.nextStr();
        shaderData.enableMacro(enabledMacro);
      }

      const { renderState } = materal;
      const { blendState, depthState, rasterState, stencilState } = renderState;
      const { targetBlendState } = blendState;

      // 6 is the count of render state float32, x86 problem can't use Float32Array.
      blendState.blendColor.r = bufferReader.nextFloat32();
      blendState.blendColor.g = bufferReader.nextFloat32();
      blendState.blendColor.b = bufferReader.nextFloat32();
      blendState.blendColor.a = bufferReader.nextFloat32();
      rasterState.depthBias = bufferReader.nextFloat32();
      rasterState.slopeScaledDepthBias = bufferReader.nextFloat32();

      // 24 is the count of render state uint8 count
      const states = bufferReader.nextUint8Array(24);
      // set blend state
      blendState.alphaToCoverage = states[0] !== 0;

      targetBlendState.alphaBlendOperation = states[1];
      targetBlendState.colorBlendOperation = states[2];
      targetBlendState.colorWriteMask = states[3];
      targetBlendState.destinationAlphaBlendFactor = states[4];
      targetBlendState.destinationColorBlendFactor = states[5];
      targetBlendState.sourceAlphaBlendFactor = states[6];
      targetBlendState.sourceColorBlendFactor = states[7];

      depthState.compareFunction = states[8];
      depthState.enabled = states[9] !== 0;
      depthState.writeEnabled = states[10] !== 0;

      rasterState.cullMode = states[11];

      stencilState.compareFunctionBack = states[12];
      stencilState.compareFunctionFront = states[13];
      stencilState.enabled = states[14] !== 0;
      stencilState.failOperationBack = states[15];
      stencilState.failOperationFront = states[16];
      stencilState.mask = states[17];
      stencilState.passOperationBack = states[18];
      stencilState.passOperationFront = states[19];
      stencilState.referenceValue = states[20];
      stencilState.writeMask = states[21];
      stencilState.zFailOperationBack = states[22];
      stencilState.zFailOperationFront = states[23];

      Promise.all(shaderDataSetPromises)
        .then(() => {
          resolve(materal);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  private static setShaderDataByType(
    bufferReader: BufferReader,
    shaderData: ShaderData,
    propertyName: string,
    type: number,
    resourceManager: ResourceManager
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let needAsync = false;

      switch (type) {
        // float
        case 0:
          shaderData.setFloat(propertyName, bufferReader.nextFloat32());
          break;
        // int
        case 1:
          shaderData.setInt(propertyName, bufferReader.nextInt32());
          break;
        // vector2
        case 2:
          shaderData.setVector2(propertyName, new Vector2(bufferReader.nextFloat32(), bufferReader.nextFloat32()));
          break;
        // vector3
        case 3:
          const vec3 = new Vector3(bufferReader.nextFloat32(), bufferReader.nextFloat32(), bufferReader.nextFloat32());
          shaderData.setVector3(propertyName, vec3);
          break;
        // vector4
        case 4:
          const vec4 = new Vector4(
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32()
          );
          shaderData.setVector4(propertyName, vec4);
          break;
        // matrix4x4
        case 5:
          const mat4x4 = new Matrix(
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32()
          );
          shaderData.setMatrix(propertyName, mat4x4);
          break;
        // color
        case 6:
          const color = new Color(
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32(),
            bufferReader.nextFloat32()
          );
          shaderData.setColor(propertyName, color);
          break;
        // texture
        case 7:
          needAsync = true;
          const texturePath = bufferReader.nextStr();
          resourceManager
            .load<Texture>(texturePath)
            .then((texture) => {
              shaderData.setTexture(propertyName, texture);
              resolve();
            })
            .catch((err) => {
              reject(err);
            });
          break;
        // intArray
        case 8:
          const intLen = bufferReader.nextUint16();
          const int32Array = new Int32Array(intLen);
          for (let i = 0; i < intLen; i++) {
            int32Array[i] = bufferReader.nextInt32();
          }
          shaderData.setIntArray(propertyName, int32Array);
          break;
        // float array
        case 9:
          const floatLen = bufferReader.nextUint16();
          const float32Array = new Float32Array(floatLen);
          for (let i = 0; i < intLen; i++) {
            float32Array[i] = bufferReader.nextFloat32();
          }
          shaderData.setFloatArray(propertyName, float32Array);
          break;
        // textureArray
        case 10:
          needAsync = true;
          const textureLen = bufferReader.nextUint16();
          const texturePaths: string[] = new Array(textureLen);
          for (let i = 0; i < textureLen; i++) {
            texturePaths[i] = bufferReader.nextStr();
          }
          resourceManager
            // @ts-ignore
            .load<Texture[]>(texturePaths)
            .then((textures) => {
              shaderData.setTextureArray(propertyName, textures);
              resolve();
            })
            .catch((err) => {
              reject(err);
            });
          break;
      }

      if (!needAsync) {
        resolve();
      }
    });
  }
}
