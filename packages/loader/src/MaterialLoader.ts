import {
  AssetPromise,
  AssetType,
  LoadItem,
  Loader,
  Material,
  ResourceManager,
  Shader,
  Texture2D,
  resourceLoader
} from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { IAssetRef, IColor, IMaterialSchema, IVector2, IVector3, IVector4 } from "./resource-deserialize";

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
      this.request(item.url, {
        ...item,
        type: "json"
      })
        .then((materialSchema: IMaterialSchema) => {
          const engine = resourceManager.engine;
          const { name, shader, shaderData, macros, renderState } = materialSchema;
          const material = new Material(engine, Shader.find(shader));
          material.name = name;

          const texturePromises = new Array<Promise<Texture2D>>();
          const materialShaderData = material.shaderData;
          for (let key in shaderData) {
            const { type, value } = shaderData[key];

            switch (type) {
              case "Vector2":
                materialShaderData.setVector2(key, new Vector2((<IVector2>value).x, (<IVector2>value).y));
                break;
              case "Vector3":
                materialShaderData.setVector3(
                  key,
                  new Vector3((<IVector3>value).x, (<IVector3>value).y, (<IVector3>value).z)
                );
                break;
              case "Vector4":
                materialShaderData.setVector4(
                  key,
                  new Vector4((<IVector4>value).x, (<IVector4>value).y, (<IVector4>value).z, (<IVector4>value).w)
                );
                break;
              case "Color":
                materialShaderData.setColor(
                  key,
                  new Color((<IColor>value).r, (<IColor>value).g, (<IColor>value).b, (<IColor>value).a)
                );
                break;
              case "Float":
                materialShaderData.setFloat(key, <number>value);
                break;
              case "Texture":
                texturePromises.push(
                  // @ts-ignore
                  resourceManager.getResourceByRef<Texture2D>(<IAssetRef>value).then((texture) => {
                    materialShaderData.setTexture(key, texture);
                  })
                );
                break;
              case "Boolean":
                materialShaderData.setInt(key, value ? 1 : 0);
              case "Integer":
                materialShaderData.setInt(key, Number(value));
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
            resolve(material);
          });
        })
        .catch(reject);
    });
  }
}
