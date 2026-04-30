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
 * Tests for the 2-tier render state priority system.
 *
 * Priority order (highest to lowest):
 *   1. Shader constant  -> bit set in `constantPropertyMask`, value already written to `this`
 *   2. shaderData value -> property is present in `renderStateDataMap` AND has value set
 *
 * If neither tier provides a value, the existing field value on `this` is kept
 * (which is the RenderState class field initializer default for shaders that
 * don't declare the property).
 */
describe("RenderState per-property priority", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  const createShaderData = () => new Material(engine, Shader.find("BlinnPhong")).shaderData;

  describe("BlendState", () => {
    it("shader constant wins over shaderData", () => {
      const state = new BlendState();
      state.targetBlendState.enabled = true;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("blendEnabled");
      shaderData.setInt(prop, 0);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateEnabled0]: prop
      };
      const constantMask = 1 << RenderStateElementKey.BlendStateEnabled0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      expect(state.targetBlendState.enabled).to.eq(true);
    });

    it("shaderData wins when no shader constant", () => {
      const state = new BlendState();
      state.targetBlendState.sourceColorBlendFactor = BlendFactor.One;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("sourceColorBlendFactor");
      shaderData.setInt(prop, BlendFactor.SourceAlpha);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: prop
      };
      const constantMask = 0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      expect(state.targetBlendState.sourceColorBlendFactor).to.eq(BlendFactor.SourceAlpha);
    });

    it("falls back to 0 when shaderData has no value for the mapped property", () => {
      const state = new BlendState();
      // Pre-populate with a non-zero value to ensure the result comes from the
      // Unity-style 0 fallback rather than the field's pre-existing (potentially
      // polluted) value.
      state.targetBlendState.sourceColorBlendFactor = BlendFactor.SourceAlpha;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("sourceColorBlendFactor");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: prop
      };
      const constantMask = 0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      // Unity-style: declared variable + unset shaderData → 0.
      expect(state.targetBlendState.sourceColorBlendFactor).to.eq(BlendFactor.Zero);
    });

    it("leaves the field untouched when the property key is missing from dataMap", () => {
      const state = new BlendState();
      // Set a sentinel value to verify _applyShaderDataValue does not overwrite
      // it when the shader didn't bind this slot — the existing field value
      // (either ShaderLab constant or class field initializer) must be kept.
      state.targetBlendState.enabled = true;

      const shaderData = createShaderData();
      const dataMap: Record<number, ShaderProperty> = {};
      const constantMask = 0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      expect(state.targetBlendState.enabled).to.eq(true);
    });
  });

  describe("DepthState", () => {
    it("shader constant wins over shaderData", () => {
      const state = new DepthState();
      state.writeEnabled = false;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled");
      shaderData.setInt(prop, 1);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };
      const constantMask = 1 << RenderStateElementKey.DepthStateWriteEnabled;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      expect(state.writeEnabled).to.eq(false);
    });

    it("shaderData wins when no shader constant", () => {
      const state = new DepthState();
      state.writeEnabled = true;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled");
      shaderData.setInt(prop, 0);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };
      const constantMask = 0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      expect(state.writeEnabled).to.eq(false);
    });

    it("falls back to false when shaderData has no value", () => {
      const state = new DepthState();
      // Pre-populate with a non-default value to verify the result comes from the
      // Unity-style 0 fallback rather than the field's pre-existing value.
      state.writeEnabled = true;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };
      const constantMask = 0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      // Unity-style: declared variable + unset shaderData → false (boolean 0).
      expect(state.writeEnabled).to.eq(false);
    });
  });

  describe("RasterState", () => {
    it("shaderData provides cull mode when no shader constant", () => {
      const state = new RasterState();
      state.cullMode = CullMode.Back;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("rasterStateCullMode");
      shaderData.setInt(prop, CullMode.Front);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.RasterStateCullMode]: prop
      };
      const constantMask = 0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      expect(state.cullMode).to.eq(CullMode.Front);
    });
  });

  describe("StencilState", () => {
    it("shaderData provides multiple stencil values", () => {
      const state = new StencilState();

      const shaderData = createShaderData();
      const enabledProp = ShaderProperty.getByName("stencilEnabled");
      const refProp = ShaderProperty.getByName("stencilReferenceValue");
      const cmpProp = ShaderProperty.getByName("stencilCompareFunctionFront");
      const passOpProp = ShaderProperty.getByName("stencilPassOperationFront");

      shaderData.setInt(enabledProp, 1);
      shaderData.setInt(refProp, 5);
      shaderData.setInt(cmpProp, CompareFunction.LessEqual);
      shaderData.setInt(passOpProp, StencilOperation.IncrementSaturate);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.StencilStateEnabled]: enabledProp,
        [RenderStateElementKey.StencilStateReferenceValue]: refProp,
        [RenderStateElementKey.StencilStateCompareFunctionFront]: cmpProp,
        [RenderStateElementKey.StencilStatePassOperationFront]: passOpProp
      };
      const constantMask = 0;

      state._applyShaderDataValue(dataMap, shaderData, constantMask);

      expect(state.enabled).to.eq(true);
      expect(state.referenceValue).to.eq(5);
      expect(state.compareFunctionFront).to.eq(CompareFunction.LessEqual);
      expect(state.passOperationFront).to.eq(StencilOperation.IncrementSaturate);
    });
  });
});
