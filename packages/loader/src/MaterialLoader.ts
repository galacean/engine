import {
  AssetPromise,
  AssetType,
  BaseMaterial,
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
    return resourceManager._request(item.url!, { ...item, type: "json" }).then((materialSchema: IMaterialSchema) => {
      const { shaderRef, shader: shaderName } = materialSchema;
      const engine = resourceManager.engine;
      if (shaderRef) {
        return resourceManager.getResourceByRef<Shader>(shaderRef).then((shader) => {
          // World projects retain the legacy fallback for an unmapped reference.
          // A resolved asset always wins over a registered shader with the same name.
          if (shader === null && shaderName) {
            const fallback = Shader.find(shaderName);
            if (fallback) return this._getMaterialByShader(materialSchema, fallback, engine);
          }
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

    const material = new Material(engine, shader);
    try {
      material.name = name;

      const textureReferences: { key: string; ref: RefItem }[] = [];
      const materialShaderData = material.shaderData;
      for (const key in shaderData) {
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
            if (key !== "material_ScreenSpaceReflectionIntensity") {
              materialShaderData.setFloat(key, <number>value);
            }
            break;
          case MaterialLoaderType.Texture:
            if (value == null) materialShaderData.setTexture(key, null);
            else textureReferences.push({ key, ref: value });
            break;
          case MaterialLoaderType.Boolean:
            materialShaderData.setInt(key, value ? 1 : 0);
            break;
          case MaterialLoaderType.Integer:
            materialShaderData.setInt(key, Number(value));
            break;
          // The old World loader ignores unsupported fields, including editor-only
          // Select/Toggle metadata. Preserve that behavior without interpreting them.
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

      // Parse synchronous fields before starting dependencies. Publish texture
      // bindings only after all loads succeed, so late completions cannot write
      // into a material already destroyed by another failed dependency.
      const textures = await Promise.all(
        textureReferences.map(async ({ ref }) => {
          const texture = await engine.resourceManager.getResourceByRef<Texture>(ref);
          if (!(texture instanceof Texture)) {
            throw new Error(`MaterialLoader: texture reference "${ref.url}" did not resolve to a Texture.`);
          }
          return texture;
        })
      );
      for (let i = 0; i < textures.length; i++) {
        materialShaderData.setTexture(textureReferences[i].key, textures[i]);
      }
      if (materialSchema.screenSpaceReflectionIntensity !== undefined) {
        material.screenSpaceReflectionIntensity = materialSchema.screenSpaceReflectionIntensity;
      } else if (shaderData["material_ScreenSpaceReflectionIntensity"] !== undefined) {
        material.screenSpaceReflectionIntensity = Number(shaderData["material_ScreenSpaceReflectionIntensity"].value);
      } else if (shader === engine._builtinShaders.pbr) {
        material.screenSpaceReflectionIntensity = 1.0;
      }
      // Sync default DepthOnly render queue for legacy built-in PBR/Unlit/BlinnPhong .mat assets
      // that declare a Forward render queue (e.g. Transparent glass) without an explicit material_DepthOnlyRenderQueue.
      const builtinShaders = engine._builtinShaders;
      if (shader === builtinShaders.pbr || shader === builtinShaders.unlit || shader === builtinShaders.blinnPhong) {
        BaseMaterial._syncDefaultDepthOnlyRenderQueue(materialShaderData);
      }
      if (materialSchema.contributeScreenSpaceReflectionDepth !== undefined) {
        material.contributeScreenSpaceReflectionDepth = materialSchema.contributeScreenSpaceReflectionDepth;
      }
      if (materialSchema.screenSpaceReflectionBilateral !== undefined) {
        material.screenSpaceReflectionBilateral = materialSchema.screenSpaceReflectionBilateral;
      }
      return material;
    } catch (error) {
      material.destroy();
      throw error;
    }
  }
}
