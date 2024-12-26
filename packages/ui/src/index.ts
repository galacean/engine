import {
  BlendFactor,
  BlendOperation,
  CullMode,
  Engine,
  Entity,
  IClassObject,
  Material,
  PipelineStage,
  ReflectionParser,
  RenderQueueType,
  Shader,
  ShaderPass
} from "@galacean/engine";
import uiDefaultFs from "./shader/uiDefault.fs.glsl";
import uiDefaultVs from "./shader/uiDefault.vs.glsl";

export { Button } from "./component/advanced/Button";
export { Image } from "./component/advanced/Image";
export { Label } from "./component/advanced/Label";
export { ColorTransition } from "./component/interactive/transition/ColorTransition";
export { ScaleTransition } from "./component/interactive/transition/ScaleTransition";
export { SpriteTransition } from "./component/interactive/transition/SpriteTransition";
export { Transition } from "./component/interactive/transition/Transition";
export { UICanvas } from "./component/UICanvas";
export { UIGroup } from "./component/UIGroup";
export { UIRenderer } from "./component/UIRenderer";
export { UITransform } from "./component/UITransform";
export { CanvasRenderMode } from "./enums/CanvasRenderMode";
export { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";
export { UIPointerEventEmitter } from "./input/UIPointerEventEmitter";

export class EngineExtension {
  _uiDefaultMaterial: Material;
  _getUIDefaultMaterial(): Material {
    if (!this._uiDefaultMaterial) {
      const shader =
        Shader.find("ui") ??
        Shader.create("ui", [
          new ShaderPass("Forward", uiDefaultVs, uiDefaultFs, {
            pipelineStage: PipelineStage.Forward
          })
        ]);
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

ReflectionParser.registerCustomParseComponent("Label", async (instance: any, item: Omit<IClassObject, "class">) => {
  const { props } = item;
  if (!props.font) {
    // @ts-ignore
    instance.font = Font.createFromOS(instance.engine, props.fontFamily || "Arial");
  }
  return instance;
});
