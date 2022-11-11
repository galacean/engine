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
        const { shader, shaderData, macros, renderState } = json;

        let material;
        switch (shader) {
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

        const texturePromises = new Array<Promise<Texture2D | void>>();
        const materialShaderData = material.shaderData;
        for (let key in shaderData) {
          const { type, value } = shaderData[key];``

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
          material[key] = renderState[key];
        }

        Promise.all(texturePromises).then(() => {
          resolve(material);  
        });
      });
    });
  }
}
