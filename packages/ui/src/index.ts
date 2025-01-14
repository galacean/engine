import {
  BlendFactor,
  BlendOperation,
  CullMode,
  Engine,
  Entity,
  Font,
  IClass,
  Loader,
  Material,
  PipelineStage,
  ReflectionParser,
  RenderQueueType,
  Shader,
  ShaderPass
} from "@galacean/engine";
import { UICanvas } from ".";
import { UIGroup } from "./component/UIGroup";
import { UITransform } from "./component/UITransform";
import { Button } from "./component/advanced/Button";
import { Image } from "./component/advanced/Image";
import { Text } from "./component/advanced/Text";
import { ColorTransition } from "./component/interactive/transition/ColorTransition";
import { ScaleTransition } from "./component/interactive/transition/ScaleTransition";
import { SpriteTransition } from "./component/interactive/transition/SpriteTransition";
import uiDefaultFs from "./shader/uiDefault.fs.glsl";
import uiDefaultVs from "./shader/uiDefault.vs.glsl";

export { UICanvas } from "./component/UICanvas";
export { UIGroup } from "./component/UIGroup";
export { UIRenderer } from "./component/UIRenderer";
export { UITransform } from "./component/UITransform";
export { Button } from "./component/advanced/Button";
export { Image } from "./component/advanced/Image";
export { Text } from "./component/advanced/Text";
export { ColorTransition } from "./component/interactive/transition/ColorTransition";
export { ScaleTransition } from "./component/interactive/transition/ScaleTransition";
export { SpriteTransition } from "./component/interactive/transition/SpriteTransition";
export { Transition } from "./component/interactive/transition/Transition";
export { CanvasRenderMode } from "./enums/CanvasRenderMode";
export { ResolutionAdaptationMode } from "./enums/ResolutionAdaptationMode";
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

ReflectionParser.registerCustomParseComponent("Text", async (instance: any, item: Omit<IClass, "class">) => {
  const { props } = item;
  if (!props.font) {
    // @ts-ignore
    instance.font = Font.createFromOS(instance.engine, props.fontFamily || "Arial");
  }
  return instance;
});

/**
 * Register GUI components for the editor.
 */
export function registerGUI() {
  Loader.registerClass("Text", Text);
  Loader.registerClass("Image", Image);
  Loader.registerClass("Button", Button);
  Loader.registerClass("UIGroup", UIGroup);
  Loader.registerClass("UICanvas", UICanvas);
  Loader.registerClass("UITransform", UITransform);
  Loader.registerClass("ScaleTransition", ScaleTransition);
  Loader.registerClass("ColorTransition", ColorTransition);
  Loader.registerClass("SpriteTransition", SpriteTransition);
}
