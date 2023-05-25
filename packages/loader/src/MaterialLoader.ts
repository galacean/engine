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
import { IPrefabMaterial } from "./resource-deserialize/resources/prefab/PrefabDesign";

function setProperty(object: Object, key: string, value: any) {
  if (typeof value === "object") {
    for (let subKey in value) {
      setProperty(object[key], subKey, value[subKey]);
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

          setProperty(material, "renderState", renderState);

          return Promise.all(texturePromises).then(() => {
            resolve(material);
          });
        })
        .catch(reject);
    });
  }
}
