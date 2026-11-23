import { Color } from "@galacean/engine-math";
import { DataObject } from "../../base/DataObject";
import { ShaderData, ShaderProperty } from "..";
import { RenderStateElementMap } from "../../BasicResources";
import { Engine } from "../../Engine";
import { RenderQueueType } from "../enums/RenderQueueType";
import { RenderStateElementKey } from "../enums/RenderStateElementKey";
import { BlendState } from "./BlendState";
import { DepthState } from "./DepthState";
import { RasterState } from "./RasterState";
import { StencilState } from "./StencilState";

const enum VariableStateGroup {
  Blend = 1,
  Depth = 2,
  Stencil = 4,
  Raster = 8
}

interface PassStateBindings {
  variables: Record<number, ShaderProperty>;
  groups: number;
  state: RenderState;
  shadow: RenderState;
  revision: number;
  color?: ShaderProperty;
}

/**
 * Render state.
 */
export class RenderState extends DataObject {
  private static readonly _bindings = new WeakMap<RenderState, WeakMap<ShaderData, PassStateBindings>>();

  /** Blend state. */
  readonly blendState: BlendState = new BlendState();
  /** Depth state. */
  readonly depthState: DepthState = new DepthState();
  /** Stencil state. */
  readonly stencilState: StencilState = new StencilState();
  /** Raster state. */
  readonly rasterState: RasterState = new RasterState();

  /** Render queue type. */
  renderQueueType: RenderQueueType = RenderQueueType.Opaque;

  /**
   * @internal
   */
  _applyStates(
    engine: Engine,
    frontFaceInvert: boolean,
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    customRenderStates?: RenderStateElementMap | null,
    renderElementData?: ShaderData
  ): void {
    const resolved = this._resolve(engine, renderStateDataMap, shaderData, renderElementData);
    engine._hardwareRenderer.applyRenderState(
      resolved,
      engine._lastRenderState,
      engine._renderContext.flipProjection ? !frontFaceInvert : frontFaceInvert,
      customRenderStates
    );
  }

  /** @internal Resolve pass inputs without mutating shared authored state. */
  _resolve(
    engine: Engine,
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData,
    renderElementData?: ShaderData
  ): RenderState {
    let byMaterial = RenderState._bindings.get(this);
    if (!byMaterial) RenderState._bindings.set(this, (byMaterial = new WeakMap()));
    let bindings = byMaterial.get(shaderData);
    if (!bindings || bindings.variables !== renderStateDataMap) {
      bindings = this._createBindings(renderStateDataMap);
      byMaterial.set(shaderData, bindings);
    }
    const { state, groups, color } = bindings;
    if (renderElementData || bindings.revision !== shaderData._renderStateRevision) {
      if (groups & VariableStateGroup.Blend)
        state.blendState._applyShaderDataValue(renderStateDataMap, shaderData, renderElementData);
      if (groups & VariableStateGroup.Depth) state.depthState._applyShaderDataValue(renderStateDataMap, shaderData);
      if (groups & VariableStateGroup.Stencil) state.stencilState._applyShaderDataValue(renderStateDataMap, shaderData);
      if (groups & VariableStateGroup.Raster) state.rasterState._applyShaderDataValue(renderStateDataMap, shaderData);
      bindings.revision = renderElementData ? -1 : shaderData._renderStateRevision;
    } else if (color) {
      // A caller may change the four color components without assigning a new property.
      const value = shaderData.getColor(color);
      if (value) state.blendState.blendColor.copyFrom(value);
    }
    return engine._renderContext.shadowDepthBias ? bindings.shadow : state;
  }

  private _createBindings(variables: Record<number, ShaderProperty>): PassStateBindings {
    let groups = 0;
    for (const name in variables) {
      const key = Number(name);
      variables[key]._controlsRenderState = true;
      if (key <= RenderStateElementKey.BlendStateAlphaToCoverage) groups |= VariableStateGroup.Blend;
      else if (key <= RenderStateElementKey.DepthStateCompareFunction) groups |= VariableStateGroup.Depth;
      else if (key <= RenderStateElementKey.StencilStateZFailOperationBack) groups |= VariableStateGroup.Stencil;
      else if (key <= RenderStateElementKey.RasterStateSlopeScaledDepthBias) groups |= VariableStateGroup.Raster;
    }
    // Unbound properties inherit live authored values. Resolved shader inputs are own
    // properties, so updating materials and render elements never mutates the pass.
    const state: RenderState = groups
      ? Object.assign(Object.create(this), {
          blendState:
            groups & VariableStateGroup.Blend
              ? Object.assign(Object.create(this.blendState), {
                  targetBlendState: Object.create(this.blendState.targetBlendState),
                  blendColor: variables[RenderStateElementKey.BlendStateBlendColor]
                    ? new Color()
                    : this.blendState.blendColor
                })
              : this.blendState,
          depthState: groups & VariableStateGroup.Depth ? Object.create(this.depthState) : this.depthState,
          stencilState: groups & VariableStateGroup.Stencil ? Object.create(this.stencilState) : this.stencilState,
          rasterState: groups & VariableStateGroup.Raster ? Object.create(this.rasterState) : this.rasterState
        })
      : this;
    const shadow: RenderState = Object.assign(Object.create(state), {
      rasterState: Object.assign(Object.create(state.rasterState), { depthBias: 1, slopeScaledDepthBias: 1 })
    });
    return {
      variables,
      groups,
      state,
      shadow,
      revision: -1,
      color: variables[RenderStateElementKey.BlendStateBlendColor]
    };
  }

  /**
   * @internal
   */
  _getRenderQueueByShaderData(
    renderStateDataMap: Record<number, ShaderProperty>,
    shaderData: ShaderData
  ): RenderQueueType {
    const renderQueueTypeProp = renderStateDataMap[RenderStateElementKey.RenderQueueType];
    if (renderQueueTypeProp !== undefined) {
      const renderQueueType = shaderData._propertyValueMap[renderQueueTypeProp._uniqueId] as
        | RenderQueueType
        | undefined;
      if (renderQueueType !== undefined) return renderQueueType;
    }
    return this.renderQueueType;
  }
}
