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

  addPendingDestroyScript(component: Script): void {
    this._pendingDestroyScripts.push(component);
  }

  callScriptOnStart(): void {
    const onStartScripts = this._onStartScripts;
    if (onStartScripts.length > 0) {
      // The 'onStartScripts.length' maybe add if you add some Script with addComponent() in some Script's onStart()
      onStartScripts.forEachAndClean((script: Script) => {
        script._started = true;
        this.removeOnStartScript(script);
        script.onStart();
      });
    }
  }

  callScriptOnUpdate(deltaTime: number): void {
    this._onUpdateScripts.forEach((element: Script) => {
      if (element._started) {
        element.onUpdate(deltaTime);
      }
    });
  }

  callScriptOnLateUpdate(deltaTime: number): void {
    this._onLateUpdateScripts.forEach((element: Script) => {
      if (element._started) {
        element.onLateUpdate(deltaTime);
      }
    });
  }

  callScriptOnPhysicsUpdate(): void {
    this._onPhysicsUpdateScripts.forEach((element: Script) => {
      if (element._started) {
        element.onPhysicsUpdate();
      }
    });
  }

  callAnimationUpdate(deltaTime: number): void {
    this._onUpdateAnimations.forEach((element: Component) => {
      //@ts-ignore
      element.update(deltaTime);
    });
  }

  callRendererOnUpdate(deltaTime: number): void {
    this._onUpdateRenderers.forEach((element: Renderer) => {
      element.update(deltaTime);
    });
  }

  handlingInvalidScripts(): void {
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
    camera.entity._scripts.forEach((element: Script) => {
      element.onBeginRender(camera);
    });
  }

  callCameraOnEndRender(camera: Camera): void {
    camera.entity._scripts.forEach((element: Script) => {
      element.onEndRender(camera);
    });
  }

  getActiveChangedTempList(): Component[] {
    return this._componentsContainerPool.length ? this._componentsContainerPool.pop() : [];
  }

  putActiveChangedTempList(componentContainer: Component[]): void {
    componentContainer.length = 0;
    this._componentsContainerPool.push(componentContainer);
  }

  /**
   * @internal
   */
  _gc() {
    this._renderers.garbageCollection();
    this._onStartScripts.garbageCollection();
    this._onUpdateScripts.garbageCollection();
    this._onLateUpdateScripts.garbageCollection();
    this._onPhysicsUpdateScripts.garbageCollection();
    this._onUpdateAnimations.garbageCollection();
    this._onUpdateRenderers.garbageCollection();
  }
}
