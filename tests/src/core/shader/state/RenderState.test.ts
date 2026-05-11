import {
  BlendFactor,
  CompareFunction,
  CullMode,
  Material,
  RenderStateElementKey,
  Shader,
  ShaderProperty,
  StencilOperation
} from "@galacean/engine-core";
// State classes are intentionally not part of the public barrel — reach into
// engine-core internals so the white-box state tests can still construct them.
import { BlendState } from "@galacean/engine-core/src/shader/state/BlendState";
import { DepthState } from "@galacean/engine-core/src/shader/state/DepthState";
import { RasterState } from "@galacean/engine-core/src/shader/state/RasterState";
import { StencilState } from "@galacean/engine-core/src/shader/state/StencilState";
import { WebGLEngine } from "@galacean/engine";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Tests for the inline render-state resolution model:
 *   - ShaderLab constants are stamped onto the pass's RenderState by
 *     `_applyConstRenderStates` once, at shader-load time. They never go
 *     through `_applyShaderDataValue`, so this suite does not cover them.
 *   - For each variable bound in `_renderStateDataMap`, `_applyShaderDataValue`
 *     reads the value from `shaderData`. If the property is unset, the
 *     fallback is the corresponding RenderState class field-initializer
 *     default (e.g. `writeEnabled = true`, `cullMode = Back`,
 *     `sourceColorBlendFactor = One`).
 *   - If a slot is not declared as a variable, `_applyShaderDataValue`
 *     leaves the field untouched — preserves any prior ShaderLab constant
 *     stamp or class field initializer.
 */
describe("RenderState per-property priority", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
  });

  const createShaderData = () => new Material(engine, Shader.find("BlinnPhong")).shaderData;

  describe("BlendState", () => {
    it("shaderData value is used when variable is bound and value is set", () => {
      const state = new BlendState();
      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("sourceColorBlendFactor");
      shaderData.setInt(prop, BlendFactor.SourceAlpha);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: prop
      };

      state._applyShaderDataValue(dataMap, shaderData);

      expect(state.targetBlendState.sourceColorBlendFactor).to.eq(BlendFactor.SourceAlpha);
    });

    it("falls back to field initializer default when variable is bound but shaderData unset", () => {
      const state = new BlendState();
      // Pre-populate with a sentinel non-default value so we can detect that
      // the result comes from the field initializer default (not the previous
      // value left on the shared shaderPass._renderState).
      state.targetBlendState.sourceColorBlendFactor = BlendFactor.SourceAlpha;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("sourceColorBlendFactor");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.BlendStateSourceColorBlendFactor0]: prop
      };

      state._applyShaderDataValue(dataMap, shaderData);

      // RenderTargetBlendState.sourceColorBlendFactor field initializer is BlendFactor.One.
      expect(state.targetBlendState.sourceColorBlendFactor).to.eq(BlendFactor.One);
    });

    it("leaves the field untouched when the slot is not declared as a variable", () => {
      const state = new BlendState();
      // Sentinel value: must survive the apply call.
      state.targetBlendState.enabled = true;

      const shaderData = createShaderData();
      const dataMap: Record<number, ShaderProperty> = {};

      state._applyShaderDataValue(dataMap, shaderData);

      expect(state.targetBlendState.enabled).to.eq(true);
    });
  });

  describe("DepthState", () => {
    it("shaderData value is used when variable is bound and value is set", () => {
      const state = new DepthState();
      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled");
      shaderData.setInt(prop, 0);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };

      state._applyShaderDataValue(dataMap, shaderData);

      expect(state.writeEnabled).to.eq(false);
    });

    it("falls back to field initializer default when variable is bound but shaderData unset", () => {
      const state = new DepthState();
      // Sentinel: pre-populate with a non-default value to verify fallback.
      state.writeEnabled = false;

      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("depthWriteEnabled");

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.DepthStateWriteEnabled]: prop
      };

      state._applyShaderDataValue(dataMap, shaderData);

      // DepthState.writeEnabled field initializer is true.
      expect(state.writeEnabled).to.eq(true);
    });
  });

  describe("RasterState", () => {
    it("shaderData provides cull mode when variable is bound", () => {
      const state = new RasterState();
      const shaderData = createShaderData();
      const prop = ShaderProperty.getByName("rasterStateCullMode");
      shaderData.setInt(prop, CullMode.Front);

      const dataMap: Record<number, ShaderProperty> = {
        [RenderStateElementKey.RasterStateCullMode]: prop
      };

      state._applyShaderDataValue(dataMap, shaderData);

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

      state._applyShaderDataValue(dataMap, shaderData);

      expect(state.enabled).to.eq(true);
      expect(state.referenceValue).to.eq(5);
      expect(state.compareFunctionFront).to.eq(CompareFunction.LessEqual);
      expect(state.passOperationFront).to.eq(StencilOperation.IncrementSaturate);
    });
  });
});
