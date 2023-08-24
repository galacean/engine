import { Material } from "../material/Material";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderUniformType } from "./ShaderUniformType";

export type UniformOptions = {
  varName?: string; // the variable name in glsl
  macroName?: string; // whether enable or disable a macro in glsl depends on setting value
  keepRef?: boolean; // whether setting a value to a property will change reference or just copy value. Only available for vector or matrix type
}

function handleMacro(value: any, macroName?: string) {
  if (macroName) {
    if (value !== undefined) {
      this.shaderData.enableMacro(macroName);
    } else {
      this.shaderData.disableMacro(macroName);
    }
  }
}

/**
 * Shader uniform decorator.
 */
export function uniform(type: ShaderUniformType, options?: UniformOptions) {
  return function (target: Material, propertyKey: string) {
    const shaderProp = ShaderProperty.getByName(options?.varName || propertyKey);
    const get = "get" + type;
    const set = "set" + type;

    let setFunc: (value: any) => void;
    if (type === ShaderUniformType.Float || type === ShaderUniformType.Int || type === ShaderUniformType.Texture || type === ShaderUniformType.TextureArray) {
      setFunc = function (value: any) {
        this.shaderData[set](shaderProp, value);
        handleMacro(value, options?.macroName);
      }
    } else if (options?.keepRef) {
      if (type === ShaderUniformType.FloatArray || type === ShaderUniformType.IntArray) {
        setFunc = function (value: any) {
          let data = this.shaderData[get](shaderProp);
          if (!data) {
            this.shaderData[set](shaderProp, value);
            data = value;
          }
          data.set(value);
          handleMacro(value, options?.macroName);
        }
      } else if (type === ShaderUniformType.Vector2 || type === ShaderUniformType.Vector3 || type === ShaderUniformType.Vector4 || type === ShaderUniformType.Matrix || type === ShaderUniformType.Color) {
        setFunc = function (value: any) {
          let data = this.shaderData[get](shaderProp);
          if (!data) {
            this.shaderData[set](shaderProp, value);
            data = value;
          }
          data.copyFrom(value);
          handleMacro(value, options?.macroName);
        }
      }
    } else {
      setFunc = function (value: any) {
        this.shaderData[set](shaderProp, value);
        handleMacro(value, options?.macroName);
      }
    }

    Reflect.defineProperty(target, propertyKey, {
      get: function () {
        return this.shaderData[get](shaderProp);
      },
      set: setFunc!,
      enumerable: false,
      configurable: true,
    });
  };
}
