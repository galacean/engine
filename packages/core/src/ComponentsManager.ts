import { Camera } from "./Camera";
import { Component } from "./Component";
import { DisorderedArray } from "./DisorderedArray";
import { Renderer } from "./Renderer";
import { Script } from "./Script";

/**
 * The manager of the components.
 */
export class ComponentsManager {
  /** @internal */
  _renderers: DisorderedArray<Renderer> = new DisorderedArray();

  // Script
  private _onStartScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onLateUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onPhysicsUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _disableScripts: Script[] = [];

  private _pendingDestroyScripts: Script[] = [];
  private _disposeDestroyScripts: Script[] = [];

  // Animation
  private _onUpdateAnimations: DisorderedArray<Component> = new DisorderedArray();

  // Render
  private _onUpdateRenderers: DisorderedArray<Renderer> = new DisorderedArray();

  // Delay dispose active/inActive Pool
  private _componentsContainerPool: Component[][] = [];

  addRenderer(renderer: Renderer) {
    renderer._rendererIndex = this._renderers.length;
    this._renderers.add(renderer);
  }

  removeRenderer(renderer: Renderer) {
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

  addOnPhysicsUpdateScript(script: Script): void {
    script._onPhysicsUpdateIndex = this._onPhysicsUpdateScripts.length;
    this._onPhysicsUpdateScripts.add(script);
  }

  removeOnPhysicsUpdateScript(script: Script): void {
    const replaced = this._onPhysicsUpdateScripts.deleteByIndex(script._onPhysicsUpdateIndex);
    replaced && (replaced._onPhysicsUpdateIndex = script._onPhysicsUpdateIndex);
    script._onPhysicsUpdateIndex = -1;
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

  addOnUpdateRenderers(renderer: Renderer): void {
    renderer._onUpdateIndex = this._onUpdateRenderers.length;
    this._onUpdateRenderers.add(renderer);
  }

  removeOnUpdateRenderers(renderer: Renderer): void {
    const replaced = this._onUpdateRenderers.deleteByIndex(renderer._onUpdateIndex);
    replaced && (replaced._onUpdateIndex = renderer._onUpdateIndex);
    renderer._onUpdateIndex = -1;
  }

  addDisableScript(component: Script): void {
    this._disableScripts.push(component);
  }

  addPendingDestroyScript(component: Script): void {
    this._pendingDestroyScripts.push(component);
  }

  callScriptOnStart(): void {
    const onStartScripts = this._onStartScripts;
    if (onStartScripts.length > 0) {
      const elements = onStartScripts._elements;
      // The 'onStartScripts.length' maybe add if you add some Script with addComponent() in some Script's onStart()
      for (let i = 0; i < onStartScripts.length; i++) {
        const script = elements[i];
        if (!script._waitHandlingInValid) {
          script._started = true;
          script._onStartIndex = -1;
          script.onStart();
        }
      }
    }
  }

  callScriptOnUpdate(deltaTime: number): void {
    const elements = this._onUpdateScripts._elements;
    for (let i = this._onUpdateScripts.length - 1; i >= 0; --i) {
      const element = elements[i];
      if (!element._waitHandlingInValid && element._started) {
        element.onUpdate(deltaTime);
      }
    }
  }

  callScriptOnLateUpdate(deltaTime: number): void {
    const elements = this._onLateUpdateScripts._elements;
    for (let i = this._onLateUpdateScripts.length - 1; i >= 0; --i) {
      const element = elements[i];
      if (!element._waitHandlingInValid && element._started) {
        element.onLateUpdate(deltaTime);
      }
    }
  }

  callScriptOnPhysicsUpdate(): void {
    const elements = this._onPhysicsUpdateScripts._elements;
    for (let i = this._onPhysicsUpdateScripts.length - 1; i >= 0; --i) {
      const element = elements[i];
      if (!element._waitHandlingInValid && element._started) {
        element.onPhysicsUpdate();
      }
    }
  }

  callAnimationUpdate(deltaTime: number): void {
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

  handlingInvalidScripts(): void {
    const { _disableScripts: disableScripts } = this;
    let length = disableScripts.length;
    if (length > 0) {
      for (let i = length - 1; i >= 0; i--) {
        const disableScript = disableScripts[i];
        disableScript._waitHandlingInValid && disableScript._handlingInValid();
      }
      disableScripts.length = 0;
    }

    const { _disposeDestroyScripts: pendingDestroyScripts, _pendingDestroyScripts: disposeDestroyScripts } = this;
    this._disposeDestroyScripts = disposeDestroyScripts;
    this._pendingDestroyScripts = pendingDestroyScripts;
    length = disposeDestroyScripts.length;
    if (length > 0) {
      for (let i = length - 1; i >= 0; i--) {
        disposeDestroyScripts[i].onDestroy();
      }
      disposeDestroyScripts.length = 0;
    }
  }

  callCameraOnBeginRender(camera: Camera): void {
    const scripts = camera.entity._scripts;
    for (let i = scripts.length - 1; i >= 0; --i) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onBeginRender(camera);
    }
  }

  callCameraOnEndRender(camera: Camera): void {
    const scripts = camera.entity._scripts;
    for (let i = scripts.length - 1; i >= 0; --i) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onEndRender(camera);
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
