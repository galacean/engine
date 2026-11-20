import {
  AssetPromise,
  AssetType,
  Engine,
  LoadItem,
  Loader,
  Material,
  RenderState,
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

const hasOwn = Object.prototype.hasOwnProperty;

type PrimitiveKind = "boolean" | "number";

const TARGET_BLEND_SCHEMA: Record<string, PrimitiveKind> = Object.assign(Object.create(null), {
  enabled: "boolean",
  colorBlendOperation: "number",
  alphaBlendOperation: "number",
  sourceColorBlendFactor: "number",
  sourceAlphaBlendFactor: "number",
  destinationColorBlendFactor: "number",
  destinationAlphaBlendFactor: "number",
  colorWriteMask: "number"
});

const BLEND_COLOR_SCHEMA: Record<string, PrimitiveKind> = Object.assign(Object.create(null), {
  r: "number",
  g: "number",
  b: "number",
  a: "number"
});

const DEPTH_STATE_SCHEMA: Record<string, PrimitiveKind> = Object.assign(Object.create(null), {
  enabled: "boolean",
  writeEnabled: "boolean",
  compareFunction: "number"
});

const STENCIL_STATE_SCHEMA: Record<string, PrimitiveKind> = Object.assign(Object.create(null), {
  enabled: "boolean",
  referenceValue: "number",
  mask: "number",
  writeMask: "number",
  compareFunctionFront: "number",
  compareFunctionBack: "number",
  passOperationFront: "number",
  passOperationBack: "number",
  failOperationFront: "number",
  failOperationBack: "number",
  zFailOperationFront: "number",
  zFailOperationBack: "number"
});

const RASTER_STATE_SCHEMA: Record<string, PrimitiveKind> = Object.assign(Object.create(null), {
  cullMode: "number",
  depthBias: "number",
  slopeScaledDepthBias: "number",
  // Legacy 1.x serialized materials include these internal RasterState fields.
  _cullFaceEnable: "boolean",
  _frontFaceInvert: "boolean"
});

function assertSafePropertyName(key: string): void {
  if (key === "constructor" || key === "prototype" || key === "__proto__") {
    throw new Error("Reserved material property: " + key);
  }
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Material property target must be an object: " + label);
  }
}

function applyWhitelistedPrimitives(
  target: Object,
  source: unknown,
  schema: Record<string, PrimitiveKind>,
  label: string
): void {
  assertPlainObject(source, label);
  for (const key in source) {
    if (!hasOwn.call(source, key)) continue;
    assertSafePropertyName(key);
    const expectedType = schema[key];
    if (!expectedType) {
      throw new Error("Unsupported material property: " + key);
    }
    const value = source[key];
    if (typeof value !== expectedType) {
      throw new Error(`Material property "${key}" must be a ${expectedType}.`);
    }
    target[key] = value;
  }
}

function applyRenderState(renderState: RenderState, source: unknown): void {
  assertPlainObject(source, "renderState");
  for (const key in source) {
    if (!hasOwn.call(source, key)) continue;
    assertSafePropertyName(key);
    const value = source[key];
    switch (key) {
      case "renderQueueType":
        if (typeof value !== "number") {
          throw new Error('Material property "renderQueueType" must be a number.');
        }
        renderState.renderQueueType = value;
        break;
      case "blendState": {
        assertPlainObject(value, "blendState");
        const blendState = renderState.blendState;
        for (const blendKey in value) {
          if (!hasOwn.call(value, blendKey)) continue;
          assertSafePropertyName(blendKey);
          const blendValue = value[blendKey];
          switch (blendKey) {
            case "alphaToCoverage":
              if (typeof blendValue !== "boolean") {
                throw new Error('Material property "alphaToCoverage" must be a boolean.');
              }
              blendState.alphaToCoverage = blendValue;
              break;
            case "blendColor":
              applyWhitelistedPrimitives(blendState.blendColor, blendValue, BLEND_COLOR_SCHEMA, "blendColor");
              break;
            case "targetBlendState":
              applyWhitelistedPrimitives(
                blendState.targetBlendState,
                blendValue,
                TARGET_BLEND_SCHEMA,
                "targetBlendState"
              );
              break;
            default:
              throw new Error("Unsupported material property: " + blendKey);
          }
        }
        break;
      }
      case "depthState":
        applyWhitelistedPrimitives(renderState.depthState, value, DEPTH_STATE_SCHEMA, "depthState");
        break;
      case "stencilState":
        applyWhitelistedPrimitives(renderState.stencilState, value, STENCIL_STATE_SCHEMA, "stencilState");
        break;
      case "rasterState":
        applyWhitelistedPrimitives(renderState.rasterState, value, RASTER_STATE_SCHEMA, "rasterState");
        break;
      default:
        throw new Error("Unsupported material property: " + key);
    }
  }
}

@resourceLoader(AssetType.Material, ["json"])
class MaterialLoader extends Loader<Material> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<Material> {
    return new AssetPromise((resolve, reject) => {
      resourceManager
        // @ts-ignore
        ._request(item.url, {
          ...item,
          type: "json"
        })
        .then((materialSchema: IMaterialSchema) => {
          const engine = resourceManager.engine;
          const { shaderRef, shader: shaderName } = materialSchema;
          const shader = Shader.find(shaderName);
          if (shader) {
            resolve(this._getMaterialByShader(materialSchema, shader, engine));
          } else if (shaderRef) {
            resolve(
              resourceManager
                // @ts-ignore
                .getResourceByRef<Shader>(<IAssetRef>shaderRef)
                .then((shader) => {
                  if (!(shader instanceof Shader)) {
                    throw new Error(`MaterialLoader: shader reference did not resolve to a Shader.`);
                  }
                  return this._getMaterialByShader(materialSchema, shader, engine);
                })
            );
          } else {
            throw new Error(`MaterialLoader: shader "${shaderName}" not found.`);
          }
        })
        .catch(reject);
    });
  }

  private _getMaterialByShader(materialSchema: IMaterialSchema, shader: Shader, engine: Engine): Promise<Material> {
    const { name, shaderData, macros, renderState } = materialSchema;

    const material = new Material(engine, shader);
    const texturePromises = new Array<Promise<Texture2D>>();
    try {
      material.name = name;

      if (renderState !== undefined && renderState !== null) {
        applyRenderState(material.renderState, renderState);
      }

      const materialShaderData = material.shaderData;
      if (shaderData) {
        for (const key in shaderData) {
          if (!hasOwn.call(shaderData, key)) continue;
          assertSafePropertyName(key);
          const property = shaderData[key];
          if (!property || typeof property !== "object") {
            throw new Error(`MaterialLoader: invalid shader data entry "${key}".`);
          }
          const { type, value } = property;

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
                  if (material.destroyed) return;
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
      }

      if (macros) {
        for (let i = 0, length = macros.length; i < length; i++) {
          const { name, value } = macros[i];
          if (value == undefined) {
            materialShaderData.enableMacro(name);
          } else {
            materialShaderData.enableMacro(name, value);
          }
        }
      }
    } catch (error) {
      material.destroy();
      throw error;
    }

    return Promise.all(texturePromises).then(
      () => material,
      (error) => {
        material.destroy();
        throw error;
      }
    );
  }
}
