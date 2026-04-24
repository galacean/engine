import {
  BlendFactor,
  BlendState,
  CompareFunction,
  CullMode,
  DepthState,
  Material,
  RasterState,
  RenderStateElementKey,
  Shader,
  ShaderProperty,
  StencilOperation,
  StencilState
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Tests for the 3-tier render state priority system.
 *
 * Priority order (highest to lowest):
 *   1. Shader constant  -> bit set in `constantPropertyMask`, value already written to `this`
 *   2. shaderData value -> property is present in `renderStateDataMap` AND has value set
 *   3. material.renderState fallback -> materialState field is used
 */
describe("RenderState per-property priority", () => {
  // WebGLEngine is initialized here to ensure the engine-side shader / macro
  // registries are ready even if not every test touches engine resources directly.
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  // `ShaderData`'s constructor is `@internal`, so obtain a fresh shaderData from a transient
  // Material instead of calling `new ShaderData(...)` directly.
  const createShaderData = () => new Material(engine, Shader.find("BlinnPhong")).shaderData;

  describe("BlendState", () => {
    it("shader constant wins over shaderData and materialState", () => {
      const state = new BlendState();
      // Simulate a shader constant already baked into `this` (e.g. pass state has `BlendState.Target[0].Enabled = true`).
      state.targetBlendState.enabled = true;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("blendEnabled");
      // shaderData explicitly disables blending.
      shaderData.setInt(prop, 0);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateEnabled0]: prop
      };
      const constantMask = 1 << RenderStateElementKey.BlendStateEnabled0;

      const materialState = new BlendState();
      materialState.targetBlendState.enabled = false;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      // The constant bit is set for the key -> the current `this.targetBlendState.enabled` is preserved.
      expect(state.targetBlendState.enabled).to.eq(true);
    });

    it("shaderData value is used when no constant bit is set", () => {
      const state = new BlendState();
      state.targetBlendState.sourceColorBlendFactor = BlendFactor.One; // old value

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("sourceColorBlendFactor");
      shaderData.setInt(prop, BlendFactor.SourceAlpha);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: prop
      };
      const constantMask = 0;

      const materialState = new BlendState();
      materialState.targetBlendState.sourceColorBlendFactor = BlendFactor.DestinationColor;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.targetBlendState.sourceColorBlendFactor).to.eq(BlendFactor.SourceAlpha);
    });

    it("falls back to materialState when shaderData has no value for the mapped property", () => {
      const state = new BlendState();
      state.targetBlendState.sourceColorBlendFactor = BlendFactor.Zero;

      const shaderData = createShaderData();
      // shaderData has NO value for this property.
      const prop = ShaderProperty.getByName("sourceColorBlendFactor_unset");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: prop
      };
      const constantMask = 0;

      const materialState = new BlendState();
      materialState.targetBlendState.sourceColorBlendFactor = BlendFactor.OneMinusSourceAlpha;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.targetBlendState.sourceColorBlendFactor).to.eq(BlendFactor.OneMinusSourceAlpha);
    });

    it("falls back to materialState when the property key is missing from dataMap", () => {
      const state = new BlendState();
      state.targetBlendState.enabled = false;

      const shaderData = createShaderData();
      const dataMap: Record<number, ShaderProperty> = {};
      const constantMask = 0;

      const materialState = new BlendState();
      materialState.targetBlendState.enabled = true;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.targetBlendState.enabled).to.eq(true);
    });
  });

  describe("DepthState", () => {
    it("shader constant wins over shaderData and materialState", () => {
      const state = new DepthState();
      state.writeEnabled = false; // baked shader constant

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled");
      shaderData.setInt(prop, 1); // shaderData says true, but constant should win

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };
      const constantMask = 1 << RenderStateElementKey.DepthStateWriteEnabled;

      const materialState = new DepthState(); // default writeEnabled = true

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.writeEnabled).to.eq(false);
    });

    it("shaderData value is used when no constant bit is set", () => {
      const state = new DepthState();

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled");
      shaderData.setInt(prop, 0);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };
      const constantMask = 0;

      const materialState = new DepthState(); // default writeEnabled = true

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.writeEnabled).to.eq(false);
    });

    it("falls back to materialState when shaderData has no value for the mapped property", () => {
      const state = new DepthState();
      state.writeEnabled = false; // pre-existing, should be overwritten by fallback

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled_unset");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };
      const constantMask = 0;

      const materialState = new DepthState();
      materialState.writeEnabled = true;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.writeEnabled).to.eq(true);
    });

    it("falls back to materialState (preserving class default true) when property is missing from dataMap", () => {
      const state = new DepthState();
      state.writeEnabled = false; // was modified earlier, will be reset to materialState

      const shaderData = createShaderData();
      const dataMap: Record<number, ShaderProperty> = {};
      const constantMask = 0;

      const materialState = new DepthState();
      // Do not touch materialState.writeEnabled -> it keeps the class default of true.
      expect(materialState.writeEnabled).to.eq(true);

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.writeEnabled).to.eq(true);
    });

    it("compareFunction: shaderData value overrides default", () => {
      const state = new DepthState();

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthCompareFunction");
      shaderData.setInt(prop, CompareFunction.Greater);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateCompareFunction]: prop
      };
      const constantMask = 0;

      const materialState = new DepthState();

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.compareFunction).to.eq(CompareFunction.Greater);
    });
  });

  describe("RasterState", () => {
    it("shader constant wins over shaderData and materialState", () => {
      const state = new RasterState();
      state.cullMode = CullMode.Off; // baked shader constant

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("rasterStateCullMode");
      shaderData.setInt(prop, CullMode.Front);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.RasterStateCullMode]: prop
      };
      const constantMask = 1 << RenderStateElementKey.RasterStateCullMode;

      const materialState = new RasterState();
      materialState.cullMode = CullMode.Back;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.cullMode).to.eq(CullMode.Off);
    });

    it("shaderData value is used when no constant bit is set", () => {
      const state = new RasterState();

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("rasterStateCullMode");
      shaderData.setInt(prop, CullMode.Front);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.RasterStateCullMode]: prop
      };
      const constantMask = 0;

      const materialState = new RasterState(); // default CullMode.Back

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.cullMode).to.eq(CullMode.Front);
    });

    it("falls back to materialState when shaderData has no value for the mapped property", () => {
      const state = new RasterState();
      state.cullMode = CullMode.Front;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("rasterStateCullMode_unset");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.RasterStateCullMode]: prop
      };
      const constantMask = 0;

      const materialState = new RasterState();
      materialState.cullMode = CullMode.Off;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.cullMode).to.eq(CullMode.Off);
    });

    it("falls back to materialState when property key is missing from dataMap", () => {
      const state = new RasterState();
      state.cullMode = CullMode.Front;

      const shaderData = createShaderData();
      const dataMap: Record<number, ShaderProperty> = {};
      const constantMask = 0;

      const materialState = new RasterState();
      materialState.cullMode = CullMode.Off;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.cullMode).to.eq(CullMode.Off);
    });
  });

  describe("StencilState", () => {
    it("shader constant wins over shaderData and materialState", () => {
      const state = new StencilState();
      state.enabled = true; // baked shader constant

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("stencilStateEnabled");
      shaderData.setInt(prop, 0);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.StencilStateEnabled]: prop
      };
      const constantMask = 1 << RenderStateElementKey.StencilStateEnabled;

      const materialState = new StencilState();
      materialState.enabled = false;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.enabled).to.eq(true);
    });

    it("shaderData value is used when no constant bit is set", () => {
      const state = new StencilState();

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("stencilStateEnabled");
      shaderData.setInt(prop, 1);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.StencilStateEnabled]: prop
      };
      const constantMask = 0;

      const materialState = new StencilState(); // default enabled = false

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.enabled).to.eq(true);
    });

    it("falls back to materialState when shaderData has no value for the mapped property", () => {
      const state = new StencilState();
      state.enabled = false;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("stencilStateEnabled_unset");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.StencilStateEnabled]: prop
      };
      const constantMask = 0;

      const materialState = new StencilState();
      materialState.enabled = true;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.enabled).to.eq(true);
    });

    it("falls back to materialState when property key is missing from dataMap", () => {
      const state = new StencilState();
      state.enabled = false;

      const shaderData = createShaderData();
      const dataMap: Record<number, ShaderProperty> = {};
      const constantMask = 0;

      const materialState = new StencilState();
      materialState.enabled = true;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.enabled).to.eq(true);
    });

    it("referenceValue / operations: shaderData values override materialState", () => {
      const state = new StencilState();

      const shaderData = createShaderData();
      const refProp = ShaderProperty.getByName("stencilReferenceValue");
      const passFrontProp = ShaderProperty.getByName("stencilPassOperationFront");
      shaderData.setInt(refProp, 5);
      shaderData.setInt(passFrontProp, StencilOperation.Replace);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.StencilStateReferenceValue]: refProp,
        [RenderStateElementKey.StencilStatePassOperationFront]: passFrontProp
      };
      const constantMask = 0;

      const materialState = new StencilState();
      materialState.referenceValue = 99;
      materialState.passOperationFront = StencilOperation.Zero;

      // @ts-ignore
      state._applyShaderDataValue(dataMap, shaderData, constantMask, materialState);

      expect(state.referenceValue).to.eq(5);
      expect(state.passOperationFront).to.eq(StencilOperation.Replace);
    });
  });
});
