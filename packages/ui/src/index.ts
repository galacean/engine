import { Entity } from "@galacean/engine";

export { UICanvas } from "./component/UICanvas";
export { UIGroup } from "./component/UIGroup";
export { UIRenderer } from "./component/UIRenderer";
export { UITransform } from "./component/UITransform";
export { Button } from "./component/advanced/Button";
export { Image } from "./component/advanced/Image";
export { Label } from "./component/advanced/Label";
export { ColorTransition } from "./component/interactive/transition/ColorTransition";
export { ScaleTransition } from "./component/interactive/transition/ScaleTransition";
export { SpriteTransition } from "./component/interactive/transition/SpriteTransition";
export { Transition } from "./component/interactive/transition/Transition";
export { CanvasRenderMode } from "./enums/CanvasRenderMode";
export { ResolutionAdaptationStrategy } from "./enums/ResolutionAdaptationStrategy";
export { UIPointerEventEmitter } from "./input/UIPointerEventEmitter";

export class EntityExtension {
  _hierarchyVersion = 0;
  _updateHierarchyVersion(version: number): void {
    if (this._hierarchyVersion !== version) {
      this._hierarchyVersion = version;
      // @ts-ignore
      this.parent?._updateHierarchyVersion(version);
    }
  }
}

declare module "@galacean/engine" {
  interface Entity {
    // @internal
    _hierarchyVersion: number;
    // @internal
    _updateHierarchyVersion(version: number): void;
  }
}

// 实现混入的函数
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

ApplyMixins(Entity, [EntityExtension]);
