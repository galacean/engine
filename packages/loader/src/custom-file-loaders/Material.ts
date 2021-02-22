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
    return new Promise((resolve) => {
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
      for (let i = 0; i < len; i++) {
        const propertyName = bufferReader.nextStr();
        const propertyType = types[i];
        this.setShaderDataByType(bufferReader, shaderData, propertyName, propertyType, engine.resourceManager);
      }

      const macroLen = bufferReader.nextUint8();
      for (let i = 0; i < macroLen; i++) {
        const enabledMacro = bufferReader.nextStr();
        shaderData.enableMacro(enabledMacro);
      }

      // 6 is the count of render state float32
      const statesFloat = bufferReader.nextFloat32Array(6);
      // 24 is the count of render state uint8 count
      const states = bufferReader.nextUint8Array(24);

      const { renderState } = materal;
      const { blendState, depthState, rasterState, stencilState } = renderState;
      const { targetBlendState } = blendState;

      // set blend state
      blendState.alphaToCoverage = states[0] !== 0;
      blendState.blendColor.r = statesFloat[0];
      blendState.blendColor.g = statesFloat[1];
      blendState.blendColor.b = statesFloat[2];
      blendState.blendColor.a = statesFloat[3];

      rasterState.depthBias = states[4];
      rasterState.slopeScaledDepthBias = statesFloat[5];

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

      resolve(materal);
    });
  }

  private static setShaderDataByType(
    bufferReader: BufferReader,
    shaderData: ShaderData,
    propertyName: string,
    type: number,
    resourceManager: ResourceManager
  ) {
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
        const vec3 = new Vector3();
        vec3.setValueByArray(bufferReader.nextFloat32Array(3));
        shaderData.setVector3(propertyName, vec3);
        break;
      // vector4
      case 4:
        const vec4 = new Vector4();
        vec4.setValueByArray(bufferReader.nextFloat32Array(4));
        shaderData.setVector4(propertyName, vec4);
        break;
      // matrix4x4
      case 5:
        const mat4x4 = new Matrix();
        mat4x4.setValueByArray(bufferReader.nextFloat32Array(16));
        shaderData.setMatrix(propertyName, mat4x4);
        break;
      // color
      case 6:
        const colorArray = bufferReader.nextFloat32Array(4);
        const color = new Color(colorArray[0], colorArray[1], colorArray[2], colorArray[3]);
        shaderData.setColor(propertyName, color);
        break;
      // texture
      case 7:
        const texturePath = bufferReader.nextStr();
        resourceManager.load<Texture>(texturePath).then((texture) => {
          shaderData.setTexture(propertyName, texture);
        });
        break;
      // intArray
      case 8:
        const intLen = bufferReader.nextUint16();
        const intArray = bufferReader.nextInt32Array(intLen);
        shaderData.setIntArray(propertyName, intArray);
        break;
      // float array
      case 9:
        const floatLen = bufferReader.nextUint16();
        const floatArray = bufferReader.nextFloat32Array(floatLen);
        shaderData.setFloatArray(propertyName, floatArray);
        break;
      // textureArray
      case 10:
        const textureLen = bufferReader.nextUint16();
        const texturePaths: string[] = new Array(textureLen);
        for (let i = 0; i < textureLen; i++) {
          texturePaths[i] = bufferReader.nextStr();
        }
        // @ts-ignore
        resourceManager.load<Texture[]>(texturePaths).then((textures) => {
          shaderData.setTextureArray(propertyName, textures);
        });
        break;
    }
  }
}
