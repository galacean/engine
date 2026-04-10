import {
  BlendFactor,
  BlendOperation,
  CullMode,
  Engine,
  Entity,
  Loader,
  Material,
  RenderQueueType,
  Shader
} from "@galacean/engine";
import * as GUIComponent from "./component";
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

export class EntityExtension {
  _uiHierarchyVersion = 0;
  _updateUIHierarchyVersion(version: number): void {
    if (this._uiHierarchyVersion !== version) {
      this._uiHierarchyVersion = version;
      // @ts-ignore
      this.parent?._updateUIHierarchyVersion(version);
    }
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
ApplyMixins(Entity, [EntityExtension]);

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
  return Shader.find("2D/UIDefault");
}
