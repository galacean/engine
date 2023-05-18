import {
  AssetPromise,
  AssetType,
  Loader,
  LoadItem,
  Material,
  resourceLoader,
  ResourceManager,
  Shader,
  Texture2D
} from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { IPrefabMaterial } from "./resource-deserialize/resources/prefab/PrefabDesign";

function set(obj: Object, path: string, value: any) {
  const paths = path.split(".");
  const length = paths.length;
  let current = obj;
  for (let i = 0; i < length - 1; i++) {
    const key = paths[i];
    if (!current[key]) {
      current[key] = {};
    }
    current = current[key];
  }
  current[paths[length - 1]] = value;
}

@resourceLoader(AssetType.Material, ["json"])
class MaterialLoader extends Loader<Material> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Material> {
    return new AssetPromise((resolve, reject) => {
      this.request(item.url, {
        ...item,
        type: "json"
      })
        .then((json: IPrefabMaterial) => {
          const engine = resourceManager.engine;
          const { name, shader, shaderData, macros, renderState } = json;
          const material = new Material(engine, Shader.find(shader));
          material.name = name;

          const texturePromises = new Array<Promise<Texture2D | void>>();
          const materialShaderData = material.shaderData;
          for (let key in shaderData) {
            const { type, value } = shaderData[key];

            switch (type) {
              case "Vector2":
                materialShaderData.setVector2(key, new Vector2(value.x, value.y));
                break;
              case "Vector3":
                materialShaderData.setVector3(key, new Vector3(value.x, value.y, value.z));
                break;
              case "Vector4":
                materialShaderData.setVector4(key, new Vector4(value.x, value.y, value.z, value.w));
                break;
              case "Color":
                materialShaderData.setColor(key, new Color(value.r, value.g, value.b, value.a));
                break;
              case "Float":
                materialShaderData.setFloat(key, value);
                break;
              case "Texture":
                texturePromises.push(
                  // @ts-ignore
                  resourceManager.getResourceByRef<Texture2D>(value).then((texture) => {
                    materialShaderData.setTexture(key, texture);
                  })
                );
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

          for (let key in renderState) {
            set(material.renderState, key, renderState[key]);
          }

          return Promise.all(texturePromises).then(() => {
            resolve(material);
          });
        })
        .catch(reject);
    });
  }
}
