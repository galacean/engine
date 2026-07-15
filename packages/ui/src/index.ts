import {
  BlendFactor,
  BlendOperation,
  CullMode,
  Engine,
  Loader,
  Material,
  PipelineStage,
  RenderQueueType,
  Shader,
  ShaderPass
} from "@galacean/engine";
import * as GUIComponent from "./component";
import uiDefaultFs from "./shader/uiDefault.fs.glsl";
import uiDefaultVs from "./shader/uiDefault.vs.glsl";
export * from "./component";
export { CanvasRenderMode } from "./enums/CanvasRenderMode";
export { HorizontalAlignmentMode } from "./enums/HorizontalAlignmentMode";
export { ResolutionAdaptationMode } from "./enums/ResolutionAdaptationMode";
export { VerticalAlignmentMode } from "./enums/VerticalAlignmentMode";
export { UIPointerEventEmitter } from "./input/UIPointerEventEmitter";

export class EngineExtension {
  _uiDefaultMaterial: Material;
  _getUIDefaultMaterial(): Material {
    if (!this._uiDefaultMaterial) {
      const shader = _getOrCreateUIShader();
      // @ts-ignore
      const material = new Material(this, shader);
      const renderState = material.renderState;
      const target = renderState.blendState.targetBlendState;
      target.enabled = true;
      target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
      target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
      target.sourceAlphaBlendFactor = BlendFactor.One;
      target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
      target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
      renderState.depthState.writeEnabled = false;
      renderState.rasterState.cullMode = CullMode.Off;
      renderState.renderQueueType = RenderQueueType.Transparent;
      material.isGCIgnored = true;
      this._uiDefaultMaterial = material;
    }
    return this._uiDefaultMaterial;
  }
}

declare module "@galacean/engine" {
  interface Engine {
    // @internal
    _uiDefaultMaterial: Material;
    // @internal
    _getUIDefaultMaterial(): Material;
  }
  interface Entity {
    // @internal
    _uiHierarchyVersion: number;
    // @internal
    _updateUIHierarchyVersion(version: number): void;
  }
}

function ApplyMixins(derivedCtor: any, baseCtors: any[]): void {
  baseCtors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null)
      );
    });
  });
}

ApplyMixins(Engine, [EngineExtension]);

/**
 * Register GUI components for the editor.
 */
export function registerGUI() {
  for (let key in GUIComponent) {
    Loader.registerClass(key, GUIComponent[key]);
  }
  _getOrCreateUIShader();
}

function _getOrCreateUIShader(): Shader {
  let shader = Shader.find("ui");
  if (!shader) {
    shader = Shader.create("ui", [
      new ShaderPass("Forward", uiDefaultVs, uiDefaultFs, {
        pipelineStage: PipelineStage.Forward
      })
    ]);
  }
  return shader;
}
