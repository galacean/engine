import { BufferWriter } from "../../utils/BufferWriter";
import { encoder } from "../../utils/Decorator";
import { UniformType } from "./type";
import type { IMaterialAsset } from "./type";

@encoder("Material")
export class MaterialEncoder {
  static encode(bufferWriter: BufferWriter, data: IMaterialAsset) {
    bufferWriter.writeStr(data.objectId);
    bufferWriter.writeUint16(data.renderQueueType);
    bufferWriter.writeStr(data.shader);
    const { shaderData, enabledMacro } = data;

    bufferWriter.writeUint16(enabledMacro.length);
    enabledMacro.forEach((macro) => bufferWriter.writeStr(macro));

    const shaderDataArray = Object.keys(shaderData);
    bufferWriter.writeUint16(shaderDataArray.length);

    shaderDataArray.forEach((key) => {
      const uniform = data.shaderData[key];
      let v = uniform.value;
      bufferWriter.writeUint8(uniform.type);
      bufferWriter.writeStr(key);
      switch (uniform.type) {
        case UniformType.Number:
          bufferWriter.writeFloat32(uniform.value);
          break;
        case UniformType.Color:
          bufferWriter.writeFloat32(v.r);
          bufferWriter.writeFloat32(v.g);
          bufferWriter.writeFloat32(v.b);
          bufferWriter.writeFloat32(v.a);
          break;
        case UniformType.Vector2:
          bufferWriter.writeFloat32(v.x);
          bufferWriter.writeFloat32(v.y);
          break;
        case UniformType.Vector3:
          bufferWriter.writeFloat32(v.x);
          bufferWriter.writeFloat32(v.y);
          bufferWriter.writeFloat32(v.z);
          break;
        case UniformType.Vector4:
          bufferWriter.writeFloat32(v.x);
          bufferWriter.writeFloat32(v.y);
          bufferWriter.writeFloat32(v.z);
          bufferWriter.writeFloat32(v.w);
          break;
        case UniformType.Texture:
          bufferWriter.writeStr(v.path);
          bufferWriter.writeStr(v.objectId);
          break;
      }
    });

    const str = JSON.stringify(data.renderState);
    bufferWriter.writeStr(str);
  }
}
