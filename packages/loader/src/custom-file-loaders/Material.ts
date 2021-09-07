import { AssetType, Engine, Material, ResourceManager, Shader, Texture, Texture2D } from "@oasis-engine/core";
import { ShaderData } from "@oasis-engine/core/types/shader/ShaderData";
import { Color, Matrix, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { parseRelativeUrl } from "../Util";
import { BufferReader } from "./utils/BufferReader";

enum UniformType {
  Number,
  Vector2,
  Vector3,
  Vector4,
  Color,
  Texture
}
interface UniformValue {
  type: UniformType;
  value: any; // 详细查看 UniformType 到 Value 的映射
}

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
      const objectId = bufferReader.nextStr();
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

      // uniform data length
      const dataLen = bufferReader.nextUint16();
      for (let i = 0; i < dataLen; i++) {
        const type = bufferReader.nextUint8();
        const key = bufferReader.nextStr();
        switch (type) {
          case UniformType.Number:
            {
              const value = bufferReader.nextFloat32();
              shaderData.setFloat(key, value);
            }
            break;
          case UniformType.Color:
            const r = bufferReader.nextFloat32();
            const g = bufferReader.nextFloat32();
            const b = bufferReader.nextFloat32();
            const a = bufferReader.nextFloat32();
            shaderData.setColor(key, new Color(r, g, b, a));
            break;
          case UniformType.Vector2:
            {
              const x = bufferReader.nextFloat32();
              const y = bufferReader.nextFloat32();
              shaderData.setVector2(key, new Vector2(x, y));
            }
            break;
          case UniformType.Vector3:
            {
              const x = bufferReader.nextFloat32();
              const y = bufferReader.nextFloat32();
              const z = bufferReader.nextFloat32();
              shaderData.setVector3(key, new Vector3(x, y, z));
            }
            break;
          case UniformType.Vector4:
            {
              const x = bufferReader.nextFloat32();
              const y = bufferReader.nextFloat32();
              const z = bufferReader.nextFloat32();
              const w = bufferReader.nextFloat32();
              shaderData.setVector4(key, new Vector4(x, y, z, w));
            }
            break;
          case UniformType.Texture:
            {
              const path = bufferReader.nextStr();
              const objectId = bufferReader.nextStr();
              engine.resourceManager
                .load({
                  url: path,
                  type: AssetType.EditorFile
                })
                .then(() => {
                  // @ts-ignore
                  shaderData.setTexture(key, engine.resourceManager._objectPool[objectId]);
                });
            }
            break;
        }
      }
      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = material;
      resolve(material);
    });
  }
}
