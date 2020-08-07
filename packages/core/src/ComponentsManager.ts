import { Camera } from "./Camera";
import { DisorderedArray } from "./DisorderedArray";
import { Component } from "./Component";
import { RenderableComponent } from "./RenderableComponent";
import { Script } from "./Script";

/**
 * 组件的管理员。
 */
export class ComponentsManager {
  // Script
  private _onStartScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onLateUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _destoryComponents: Script[] = [];

  // Animation
  private _onUpdateAnimations: DisorderedArray<Component> = new DisorderedArray();

  // Render
  private _renderers: DisorderedArray<RenderableComponent> = new DisorderedArray();
  private _onUpdateRenderers: DisorderedArray<RenderableComponent> = new DisorderedArray();

  // Delay dispose active/inActive Pool
  private _componentsContainerPool: Component[][] = [];

  addRenderer(renderer: RenderableComponent) {
    renderer._rendererIndex = this._renderers.length;
    this._renderers.add(renderer);
  }

  removeRenderer(renderer: RenderableComponent) {
    const replaced = this._renderers.deleteByIndex(renderer._rendererIndex);
    replaced && (replaced._rendererIndex = renderer._rendererIndex);
    renderer._rendererIndex = -1;
  }

  addOnStartScript(script: Script) {
    script._onStartIndex = this._onStartScripts.length;
    this._onStartScripts.add(script);
  }

  removeOnStartScript(script: Script): void {
    const replaced = this._onStartScripts.deleteByIndex(script._onStartIndex);
    replaced && (replaced._onStartIndex = script._onStartIndex);
    script._onStartIndex = -1;
  }

  addOnUpdateScript(script: Script) {
    script._onUpdateIndex = this._onUpdateScripts.length;
    this._onUpdateScripts.add(script);
  }

  removeOnUpdateScript(script: Script): void {
    const replaced = this._onUpdateScripts.deleteByIndex(script._onUpdateIndex);
    replaced && (replaced._onUpdateIndex = script._onUpdateIndex);
    script._onUpdateIndex = -1;
  }

  addOnLateUpdateScript(script: Script): void {
    script._onLateUpdateIndex = this._onLateUpdateScripts.length;
    this._onLateUpdateScripts.add(script);
  }

  removeOnLateUpdateScript(script: Script): void {
    const replaced = this._onLateUpdateScripts.deleteByIndex(script._onLateUpdateIndex);
    replaced && (replaced._onLateUpdateIndex = script._onLateUpdateIndex);
    script._onLateUpdateIndex = -1;
  }

  addOnUpdateAnimations(animation: Component): void {
    //@ts-ignore
    animation._onUpdateIndex = this._onUpdateAnimations.length;
    this._onUpdateAnimations.add(animation);
  }

  removeOnUpdateAnimations(animation: Component): void {
    //@ts-ignore
    const replaced = this._onUpdateAnimations.deleteByIndex(animation._onUpdateIndex);
    //@ts-ignore
    replaced && (replaced._onUpdateIndex = animation._onUpdateIndex);
    //@ts-ignore
    animation._onUpdateIndex = -1;
  }

  addOnUpdateRenderers(renderer: RenderableComponent): void {
    renderer._onUpdateIndex = this._onUpdateRenderers.length;
    this._onUpdateRenderers.add(renderer);
  }

  removeOnUpdateRenderers(renderer: RenderableComponent): void {
    const replaced = this._onUpdateRenderers.deleteByIndex(renderer._onUpdateIndex);
    replaced && (replaced._onUpdateIndex = renderer._onUpdateIndex);
    renderer._onUpdateIndex = -1;
  }

  addDestoryComponent(component): void {
    this._destoryComponents.push(component);
  }

  callScriptOnStart(): void {
    const onStartScripts = this._onStartScripts;
    if (onStartScripts.length > 0) {
      const elements = onStartScripts._elements;
      // onStartScripts's length maybe add if you add some Script with addComponent() in some Script's onStart()
      for (let i = 0; i < onStartScripts.length; i++) {
        const script = elements[i];
        script._started = true;
        script._onStartIndex = -1;
        script.onStart();
      }
      onStartScripts.length = 0;
    }
  }

  callScriptOnUpdate(deltaTime): void {
    const elements = this._onUpdateScripts._elements;
    for (let i = this._onUpdateScripts.length - 1; i >= 0; --i) {
      const element = elements[i];
      if (element._started) {
        element.onUpdate(deltaTime);
      }
    }
  }

  callScriptOnLateUpdate(deltaTime): void {
    const elements = this._onLateUpdateScripts._elements;
    for (let i = this._onLateUpdateScripts.length - 1; i >= 0; --i) {
      const element = elements[i];
      if (element._started) {
        element.onLateUpdate(deltaTime);
      }
    }
  }

  callAnimationUpdate(deltaTime): void {
    const elements = this._onUpdateAnimations._elements;
    for (let i = this._onUpdateAnimations.length - 1; i >= 0; --i) {
      //@ts-ignore
      elements[i].update(deltaTime);
    }
  }

  callRendererOnUpdate(deltaTime: number): void {
    const elements = this._onUpdateRenderers._elements;
    for (let i = this._onUpdateRenderers.length - 1; i >= 0; --i) {
      elements[i].update(deltaTime);
    }
  }

  callRender(camera: Camera): void {
    const elements = this._renderers._elements;
    for (let i = this._renderers.length - 1; i >= 0; --i) {
      elements[i]._render(camera);
    }
  }

  callComponentDestory(): void {
    const destoryComponents = this._destoryComponents;
    const length = destoryComponents.length;
    if (length > 0) {
      for (let i = length - 1; i >= 0; --i) {
        destoryComponents[i].onDestroy();
      }
      destoryComponents.length = 0;
    }
  }

  callCameraOnBeginRender(camera: Camera) {
    const camComps = camera.entity._components;
    for (let i = camComps.length - 1; i >= 0; --i) {
      const camComp = camComps[i];
      (camComp as any).onBeginRender && (camComp as any).onBeginRender(camera);
    }
  }

  callCameraOnEndRender(camera: Camera) {
    const camComps = camera.entity._components;
    for (let i = camComps.length - 1; i >= 0; --i) {
      const camComp = camComps[i];
      (camComp as any).onBeginRender && (camComp as any).onEndRender(camera);
    }
  }

  getActiveChangedTempList(): Component[] {
    return this._componentsContainerPool.length ? this._componentsContainerPool.pop() : [];
  }

  putActiveChangedTempList(componentContainer: Component[]): void {
    componentContainer.length = 0;
    this._componentsContainerPool.push(componentContainer);
  }
}
