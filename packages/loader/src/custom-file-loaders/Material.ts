import { Engine, Material, ResourceManager, Shader, Texture } from "@oasis-engine/core";
import { ShaderData } from "@oasis-engine/core/types/shader/ShaderData";
import { Color, Matrix, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { parseRelativeUrl } from "../Util";
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
      const renderQueueType = bufferReader.nextUint16();
      const shader = bufferReader.nextStr();
      const material = new Material(engine, Shader.find(shader));
      material.renderQueueType = renderQueueType;
      const { shaderData } = material;

      // read macro
      const macroLen = bufferReader.nextUint16();
      for (let i = 0; i < macroLen; i++) {
        const enabledMacro = bufferReader.nextStr();
        shaderData.enableMacro(enabledMacro);
      }

      // const propertyNames = new Array(len);
      // for (let i = 0; i < len; i++) {
      //   propertyNames[i] = bufferReader.nextStr();
      // }

      // const shaderDataSetPromises = new Array(len);
      // for (let i = 0; i < len; i++) {
      //   const propertyName = propertyNames[i];
      //   const propertyType = types[i];
      //   shaderDataSetPromises[i] = this.setShaderDataByType(
      //     bufferReader,
      //     shaderData,
      //     propertyName,
      //     propertyType,
      //     engine.resourceManager
      //   );
      // }

      // const macroLen = bufferReader.nextUint8();
      // for (let i = 0; i < macroLen; i++) {
      //   const enabledMacro = bufferReader.nextStr();
      //   shaderData.enableMacro(enabledMacro);
      // }

      // const { renderState } = material;
      // const { blendState, depthState, rasterState, stencilState } = renderState;
      // const { targetBlendState } = blendState;

      // // 6 is the count of render state float32, x86 problem can't use Float32Array.
      // blendState.blendColor.r = bufferReader.nextFloat32();
      // blendState.blendColor.g = bufferReader.nextFloat32();
      // blendState.blendColor.b = bufferReader.nextFloat32();
      // blendState.blendColor.a = bufferReader.nextFloat32();
      // rasterState.depthBias = bufferReader.nextFloat32();
      // rasterState.slopeScaledDepthBias = bufferReader.nextFloat32();

      // // 24 is the count of render state uint8 count
      // const states = bufferReader.nextUint8Array(24);
      // // set blend state
      // blendState.alphaToCoverage = states[0] !== 0;

      // targetBlendState.alphaBlendOperation = states[1];
      // targetBlendState.colorBlendOperation = states[2];
      // targetBlendState.colorWriteMask = states[3];
      // targetBlendState.destinationAlphaBlendFactor = states[4];
      // targetBlendState.destinationColorBlendFactor = states[5];
      // targetBlendState.sourceAlphaBlendFactor = states[6];
      // targetBlendState.sourceColorBlendFactor = states[7];

      // depthState.compareFunction = states[8];
      // depthState.enabled = states[9] !== 0;
      // depthState.writeEnabled = states[10] !== 0;

      // rasterState.cullMode = states[11];

      // stencilState.compareFunctionBack = states[12];
      // stencilState.compareFunctionFront = states[13];
      // stencilState.enabled = states[14] !== 0;
      // stencilState.failOperationBack = states[15];
      // stencilState.failOperationFront = states[16];
      // stencilState.mask = states[17];
      // stencilState.passOperationBack = states[18];
      // stencilState.passOperationFront = states[19];
      // stencilState.referenceValue = states[20];
      // stencilState.writeMask = states[21];
      // stencilState.zFailOperationBack = states[22];
      // stencilState.zFailOperationFront = states[23];

      resolve(material);
      // Promise.all(shaderDataSetPromises)
      //   .then(() => {
      //     resolve(material);
      //   })
      //   .catch((err) => {
      //     reject(err);
      //   });
    });
  }
}
