import {
  AssetPromise,
  AssetType,
  Engine,
  LoadItem,
  Loader,
  Material,
  ResourceManager,
  Shader,
  Texture,
  resourceLoader
} from "@galacean/engine-core";
import { Color, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { MaterialLoaderType, type IMaterialSchema } from "./schema";

const materialLoaderTypes = new Set(Object.values(MaterialLoaderType));

@resourceLoader(AssetType.Material, ["mat"])
class MaterialLoader extends Loader<Material> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Material> {
    return resourceManager._request(item.url!, { ...item, type: "json" }).then((materialSchema: IMaterialSchema) => {
      const { shaderData, shaderRef, shader: shaderName } = materialSchema;
      for (const key in shaderData) {
        const type = shaderData[key].type;
        if (!materialLoaderTypes.has(type)) {
          throw new Error(`MaterialLoader: unsupported shader data type "${type}".`);
        }
      }

      const engine = resourceManager.engine;
      if (shaderRef) {
        return resourceManager.getResourceByRef<Shader>(shaderRef).then((shader) => {
          if (!(shader instanceof Shader)) {
            throw new Error(`MaterialLoader: shader reference "${shaderRef.url}" did not resolve to a Shader.`);
          }
          return this._getMaterialByShader(materialSchema, shader, engine);
        });
      }
      const shader = shaderName && Shader.find(shaderName);
      if (!shader) throw new Error(`MaterialLoader: shader "${shaderName}" not found.`);
      return this._getMaterialByShader(materialSchema, shader, engine);
    });
  }

  private async _getMaterialByShader(
    materialSchema: IMaterialSchema,
    shader: Shader,
    engine: Engine
  ): Promise<Material> {
    const { name, shaderData, macros } = materialSchema;
    const textures = new Map<string, Texture>();
    const texturePromises = new Array<AssetPromise<void>>();
    for (const key in shaderData) {
      const property = shaderData[key];
      if (property.type === MaterialLoaderType.Texture) {
        const { value } = property;
        texturePromises.push(
          engine.resourceManager.getResourceByRef<Texture>(value).then((texture) => {
            if (!(texture instanceof Texture)) {
              throw new Error(`MaterialLoader: texture reference "${value.url}" did not resolve to a Texture.`);
            }
            textures.set(key, texture);
          })
        );
      }
    }
    await Promise.all(texturePromises);

    const material = new Material(engine, shader);
    try {
      material.name = name;
      const materialShaderData = material.shaderData;
      for (const key in shaderData) {
        const { type, value } = shaderData[key];

        switch (type) {
          case MaterialLoaderType.Vector2:
            materialShaderData.setVector2(key, new Vector2(value.x, value.y));
            break;
          case MaterialLoaderType.Vector3:
            materialShaderData.setVector3(key, new Vector3(value.x, value.y, value.z));
            break;
          case MaterialLoaderType.Vector4:
            materialShaderData.setVector4(key, new Vector4(value.x, value.y, value.z, value.w));
            break;
          case MaterialLoaderType.Color:
            materialShaderData.setColor(key, new Color(value.r, value.g, value.b, value.a));
            break;
          case MaterialLoaderType.Float:
            materialShaderData.setFloat(key, value);
            break;
          case MaterialLoaderType.Texture:
            materialShaderData.setTexture(key, textures.get(key)!);
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
      return material;
    } catch (error) {
      material.destroy();
      throw error;
    }
  }
}
