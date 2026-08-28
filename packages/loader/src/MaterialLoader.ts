import {
  AssetPromise,
  AssetType,
  Engine,
  LoadItem,
  Loader,
  Material,
  ResourceManager,
  Shader,
  Texture2D,
  resourceLoader
} from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { RefItem } from "./schema/CommonSchema";
import {
  MaterialLoaderType,
  type IColor,
  type IMaterialSchema,
  type IVector2,
  type IVector3,
  type IVector4
} from "./schema";

@resourceLoader(AssetType.Material, ["mat"])
class MaterialLoader extends Loader<Material> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Material> {
    // @ts-ignore
    return resourceManager._request(item.url, { ...item, type: "json" }).then((materialSchema: IMaterialSchema) => {
      const engine = resourceManager.engine;
      const { shaderRef, shader: shaderName } = materialSchema;
      const shader = Shader.find(shaderName);
      if (shader) {
        return this._getMaterialByShader(materialSchema, shader, engine);
      }
      if (!shaderRef) {
        throw new Error(`MaterialLoader: shader "${shaderName}" not found.`);
      }
      return (
        resourceManager
          // @ts-ignore
          .getResourceByRef<Shader>(<RefItem>shaderRef)
          .then((shader) => {
            if (!(shader instanceof Shader)) {
              throw new Error(`MaterialLoader: shader reference "${shaderRef.url}" did not resolve to a Shader.`);
            }
            return this._getMaterialByShader(materialSchema, shader, engine);
          })
      );
    });
  }

  private _getMaterialByShader(materialSchema: IMaterialSchema, shader: Shader, engine: Engine): Promise<Material> {
    const { name, shaderData, macros } = materialSchema;

    for (let key in shaderData) {
      switch (shaderData[key].type) {
        case MaterialLoaderType.Vector2:
        case MaterialLoaderType.Vector3:
        case MaterialLoaderType.Vector4:
        case MaterialLoaderType.Color:
        case MaterialLoaderType.Float:
        case MaterialLoaderType.Texture:
        case MaterialLoaderType.Boolean:
        case MaterialLoaderType.Integer:
          break;
        default:
          throw new Error(`MaterialLoader: unsupported shader data type "${shaderData[key].type}".`);
      }
    }

    const material = new Material(engine, shader);
    material.name = name;

    const texturePromises = new Array<Promise<Texture2D>>();
    const materialShaderData = material.shaderData;
    for (let key in shaderData) {
      const { type, value } = shaderData[key];

      switch (type) {
        case MaterialLoaderType.Vector2:
          materialShaderData.setVector2(key, new Vector2((<IVector2>value).x, (<IVector2>value).y));
          break;
        case MaterialLoaderType.Vector3:
          materialShaderData.setVector3(
            key,
            new Vector3((<IVector3>value).x, (<IVector3>value).y, (<IVector3>value).z)
          );
          break;
        case MaterialLoaderType.Vector4:
          materialShaderData.setVector4(
            key,
            new Vector4((<IVector4>value).x, (<IVector4>value).y, (<IVector4>value).z, (<IVector4>value).w)
          );
          break;
        case MaterialLoaderType.Color:
          materialShaderData.setColor(
            key,
            new Color((<IColor>value).r, (<IColor>value).g, (<IColor>value).b, (<IColor>value).a)
          );
          break;
        case MaterialLoaderType.Float:
          materialShaderData.setFloat(key, <number>value);
          break;
        case MaterialLoaderType.Texture:
          texturePromises.push(
            // @ts-ignore
            engine.resourceManager.getResourceByRef<Texture2D>(<RefItem>value).then((texture) => {
              materialShaderData.setTexture(key, texture);
            })
          );
          break;
        case MaterialLoaderType.Boolean:
          materialShaderData.setInt(key, value ? 1 : 0);
          break;
        case MaterialLoaderType.Integer:
          materialShaderData.setInt(key, Number(value));
          break;
        default:
          throw new Error(`MaterialLoader: unsupported shader data type "${type}".`);
      }
    }

    for (let i = 0, length = macros.length; i < length; i++) {
      const { name, value } = macros[i];
      if (value == undefined) {
        materialShaderData.enableMacro(name);
      } else {
        materialShaderData.enableMacro(name, value);
      }
    }

    return Promise.all(texturePromises).then(() => {
      return material;
    });
  }
}
