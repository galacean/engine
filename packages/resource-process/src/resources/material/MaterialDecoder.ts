import { AssetType, Engine, Material, Shader } from "@oasis-engine/core";
import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { decoder } from "../../utils/Decorator";
import { UniformType } from "./type";
import type { BufferReader } from "../../utils/BufferReader";

@decoder("Material")
export class MaterialDecoder {
  public static decode(engine: Engine, bufferReader: BufferReader): Promise<Material> {
    return new Promise((resolve) => {
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
                  type: AssetType.Oasis
                })
                .then(() => {
                  // @ts-ignore
                  shaderData.setTexture(key, engine.resourceManager._objectPool[objectId]);
                });
            }
            break;
        }
      }
      const renderStateString = bufferReader.nextStr();
      if (renderStateString.length > 0) {
        const renderState = JSON.parse(renderStateString);
        const { blendState, depthState, rasterState, stencilState } = renderState;
        const materialRenderState = material.renderState;
        if (blendState) {
          Object.keys(blendState).forEach((key) => (materialRenderState.blendState[key] = blendState[key]));
        }
        if (depthState) {
          Object.keys(depthState).forEach((key) => (materialRenderState.depthState[key] = depthState[key]));
        }
        if (rasterState) {
          Object.keys(rasterState).forEach((key) => (materialRenderState.rasterState[key] = rasterState[key]));
        }
        if (stencilState) {
          Object.keys(stencilState).forEach((key) => (materialRenderState.stencilState[key] = stencilState[key]));
        }
      }
      // @ts-ignore
      engine.resourceManager._objectPool[objectId] = material;
      resolve(material);
    });
  }
}
