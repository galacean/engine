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
import {
  MaterialLoaderType,
  type IAssetRef,
  type IColor,
  type IMaterialSchema,
  type IVector2,
  type IVector3,
  type IVector4
} from "./resource-deserialize";

function parseProperty(object: Object, key: string, value: any) {
  if (typeof value === "object") {
    for (let subKey in value) {
      parseProperty(object[key], subKey, value[subKey]);
    }
  } else {
    object[key] = value;
  }
}

@resourceLoader(AssetType.Material, ["json"])
class MaterialLoader extends Loader<Material> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Material> {
    return new AssetPromise((resolve, reject) => {
      this.request(item.url, resourceManager, {
        ...item,
        type: "json"
      })
        .then((materialSchema: IMaterialSchema) => {
          const engine = resourceManager.engine;
          const { shaderRef, shader: shaderName } = materialSchema;

          if (shaderRef) {
            resolve(
              resourceManager
                // @ts-ignore
                .getResourceByRef<Shader>(<IAssetRef>shaderRef)
                .then((shader) => this.getMaterialByShader(materialSchema, shader, engine))
            );
          } else {
            // compatible with 1.2-pre version material schema
            const shader = Shader.find(shaderName);
            resolve(this.getMaterialByShader(materialSchema, shader, engine));
          }
        })
        .catch(reject);
    });
  }

  private getMaterialByShader(materialSchema: IMaterialSchema, shader: Shader, engine: Engine): Promise<Material> {
    const { name, shaderData, macros, renderState } = materialSchema;

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
            engine.resourceManager.getResourceByRef<Texture2D>(<IAssetRef>value).then((texture) => {
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

    parseProperty(material, "renderState", renderState);

    return Promise.all(texturePromises).then(() => {
      return material;
    });
  }
}
