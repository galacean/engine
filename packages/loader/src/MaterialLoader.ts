import {
  AssetPromise,
  AssetType,
  BlinnPhongMaterial,
  Loader,
  LoadItem,
  PBRMaterial,
  PBRSpecularMaterial,
  resourceLoader,
  ResourceManager,
  ShaderData,
  Texture2D,
  UnlitMaterial
} from "@oasis-engine/core";
import { Color, Vector2, Vector3, Vector4 } from "@oasis-engine/math";

@resourceLoader(AssetType.Material, ["json"])
class MaterialLoader extends Loader<string> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<string> {
    return new AssetPromise((resolve, reject) => {
      this.request(item.url, {
        ...item,
        type: "json"
      }).then((json: { [key: string]: any }) => {
        const engine = resourceManager.engine;
        let material;

        const shaderName = json.shader;
        switch (shaderName) {
          case "pbr":
            material = new PBRMaterial(engine);
            break;
          case "pbr-specular":
            material = new PBRSpecularMaterial(engine);
            break;
          case "unlit":
            material = new UnlitMaterial(engine);
            break;
          case "blinn-phong":
            material = new BlinnPhongMaterial(engine);
            break;
        }

        const shaderData: ShaderData = material.shaderData;
        for (let key in json) {
          const value = json[key];
          if (value == null) continue;
          if (key === "shader") {
            continue;
          }

          if (key === "macros") {
            const macros = json[key];
            for (let i = 0, length = macros.length; i < length; i++) {
              const { name, value } = macros[i];
              if (value === undefined) {
                shaderData.enableMacro(name);
              } else {
                shaderData.enableMacro(name, value);
              }
            }
            continue;
          }

          if (value.refId) {
            resourceManager.getResourceByRef<Texture2D>(value).then((texture) => {
              shaderData.setTexture(key, texture);
            });
          } else if (/^u/.test(key)) {
            if (typeof value === "number") {
              shaderData.setFloat(key, value);
            } else if (value.r !== undefined) {
              shaderData.setColor(key, new Color(value.r, value.g, value.b, value.a));
            } else if (value.w !== undefined) {
              shaderData.setVector4(key, new Vector4(value.x, value.y, value.z, value.w));
            } else if (value.z !== undefined) {
              shaderData.setVector3(key, new Vector3(value.x, value.y, value.z));
            } else if (value.y !== undefined) {
              shaderData.setVector2(key, new Vector2(value.x, value.y));
            }
          } else {
            material[key] = value;
          }

          resolve(material);
        }
      });
    });
  }
}
