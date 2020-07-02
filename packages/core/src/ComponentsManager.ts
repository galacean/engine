import { ACamera } from "./ACamera";
import { DisorderedArray } from "./DisorderedArray";
import { NodeAbility as Component } from "./NodeAbility";
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
  private _onPreRenderScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onPostRenderScripts: DisorderedArray<Script> = new DisorderedArray();
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

  addOnPreRenderScript(script: Script): void {
    script._onPreRenderIndex = this._onPreRenderScripts.length;
    this._onPreRenderScripts.add(script);
  }

  removeOnPreRenderScript(script: Script): void {
    const replaced = this._onPreRenderScripts.deleteByIndex(script._onPreRenderIndex);
    replaced && (replaced._onPreRenderIndex = script._onPreRenderIndex);
    script._onPreRenderIndex = -1;
  }

  addOnPostRenderScript(script: Script): void {
    script._onPostRenderIndex = this._onPreRenderScripts.length;
    this._onPostRenderScripts.add(script);
  }

  removeOnPostRenderScript(script: Script): void {
    const replaced = this._onPostRenderScripts.deleteByIndex(script._onPostRenderIndex);
    replaced && (replaced._onPostRenderIndex = script._onPostRenderIndex);
    script._onPostRenderIndex = -1;
  }

  addOnUpdateAnimations(animation: Component): void {
    animation._onUpdateIndex = this._onUpdateAnimations.length;
    this._onUpdateAnimations.add(animation);
  }

  removeOnUpdateAnimations(animation: Component): void {
    const replaced = this._onUpdateAnimations.deleteByIndex(animation._onUpdateIndex);
    replaced && (replaced._onUpdateIndex = animation._onUpdateIndex);
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
    const length = this._onStartScripts.length;
    if (length > 0) {
      const elements = this._onStartScripts._elements;
      for (let i = length - 1; i >= 0; --i) {
        const script = elements[i];
        script.onStart();
        script._started = true;
        script._onStartIndex = -1;
      }
      this._onStartScripts.length = 0;
    }
  }

  callScriptOnUpdate(deltaTime): void {
    const elements = this._onUpdateScripts._elements;
    for (let i = this._onUpdateScripts.length - 1; i >= 0; --i) {
      elements[i].onUpdate(deltaTime);
    }
  }

  callScriptOnLateUpdate(): void {
    const elements = this._onLateUpdateScripts._elements;
    for (let i = this._onLateUpdateScripts.length - 1; i >= 0; --i) {
      elements[i].onLateUpdate();
    }
  }

  callScriptOnPreRender(): void {
    const elements = this._onPreRenderScripts._elements;
    for (let i = this._onPreRenderScripts.length - 1; i >= 0; --i) {
      elements[i].onPreRender();
    }
  }

  callScriptOnPostRender(): void {
    const elements = this._onPostRenderScripts._elements;
    for (let i = this._onPostRenderScripts.length - 1; i >= 0; --i) {
      elements[i].onPostRender();
    }
  }

  callAnimationUpdate(deltaTime): void {
    const elements = this._onUpdateAnimations._elements;
    for (let i = this._onUpdateAnimations.length - 1; i >= 0; --i) {
      elements[i].update(deltaTime);
    }
  }

  callRendererOnUpdate(deltaTime: number): void {
    const elements = this._onUpdateRenderers._elements;
    for (let i = this._onUpdateRenderers.length - 1; i >= 0; --i) {
      elements[i].onUpdate(deltaTime);
    }
  }

  callRender(camera: ACamera): void {
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

  getActiveChangedTempList(): Component[] {
    return this._componentsContainerPool.length ? this._componentsContainerPool.pop() : [];
  }

  putActiveChangedTempList(componentContainer: Component[]): void {
    componentContainer.length = 0;
    this._componentsContainerPool.push(componentContainer);
  }

  // ------------------------- @deprecated ------------------------------------------------
  private _onUpdateComponents: DisorderedArray<Component> = new DisorderedArray();

  addOnUpdateComponent(component: Component): void {
    component._onUpdateIndex = this._onUpdateComponents.length;
    this._onUpdateComponents.add(component);
  }

  removeOnUpdateComponent(component: Component): void {
    this._onUpdateComponents.delete(component);
    component._onUpdateIndex = -1;
  }

  callComponentOnUpdate(deltaTime): void {
    const elements = this._onUpdateComponents._elements;
    for (let i = this._onUpdateComponents.length - 1; i >= 0; --i) {
      elements[i].onUpdate(deltaTime);
    }
  }
}
