import { IUICanvas, IUIElement } from "@galacean/engine-design";
import { Camera } from "./Camera";
import { Component } from "./Component";
import { Renderer } from "./Renderer";
import { Script } from "./Script";
import { Animator } from "./animation";
import { DisorderedArray } from "./utils/DisorderedArray";

/**
 * The manager of the components.
 */
export class ComponentsManager {
  /* @internal */
  _cameraNeedSorting: boolean = false;
  /** @internal */
  _activeCameras: DisorderedArray<Camera> = new DisorderedArray();
  /** @internal */
  _renderers: DisorderedArray<Renderer> = new DisorderedArray();

  /** @internal */
  _overlayCanvases: DisorderedArray<IUICanvas> = new DisorderedArray();
  /* @internal */
  _overlayCanvasesSortingFlag: boolean = false;
  /** @internal */
  _canvases: DisorderedArray<IUICanvas> = new DisorderedArray();

  // Script
  private _onStartScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onLateUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onPhysicsUpdateScripts: DisorderedArray<Script> = new DisorderedArray();

  private _pendingDestroyScripts: Script[] = [];
  private _disposeDestroyScripts: Script[] = [];

  // Animation
  private _onUpdateAnimations: DisorderedArray<Animator> = new DisorderedArray();

  // Render
  private _onUpdateRenderers: DisorderedArray<Renderer> = new DisorderedArray();

  // UIElement
  private _onUpdateUIElements: DisorderedArray<IUIElement> = new DisorderedArray();

  // Delay dispose active/inActive Pool
  private _componentsContainerPool: Component[][] = [];

  addCamera(camera: Camera) {
    camera._cameraIndex = this._activeCameras.length;
    this._activeCameras.add(camera);
    this._cameraNeedSorting = true;
  }

  removeCamera(camera: Camera) {
    const replaced = this._activeCameras.deleteByIndex(camera._cameraIndex);
    replaced && (replaced._cameraIndex = camera._cameraIndex);
    camera._cameraIndex = -1;
    this._cameraNeedSorting = true;
  }

  sortCameras(): void {
    if (this._cameraNeedSorting) {
      const activeCameras = this._activeCameras;
      activeCameras.sort((a, b) => a.priority - b.priority);
      for (let i = 0, n = activeCameras.length; i < n; i++) {
        activeCameras.get(i)._cameraIndex = i;
      }
      this._cameraNeedSorting = false;
    }
  }

  addRenderer(renderer: Renderer) {
    renderer._rendererIndex = this._renderers.length;
    this._renderers.add(renderer);
  }

  removeRenderer(renderer: Renderer) {
    const replaced = this._renderers.deleteByIndex(renderer._rendererIndex);
    replaced && (replaced._rendererIndex = renderer._rendererIndex);
    renderer._rendererIndex = -1;
  }

  addUICanvas(uiCanvas: IUICanvas, isOverlay: boolean) {
    let canvases: DisorderedArray<IUICanvas>;
    if (isOverlay) {
      canvases = this._overlayCanvases;
      this._overlayCanvasesSortingFlag = true;
    } else {
      canvases = this._canvases;
    }
    uiCanvas._canvasIndex = canvases.length;
    canvases.add(uiCanvas);
  }

  removeUICanvas(uiCanvas: IUICanvas, isOverlay: boolean) {
    let canvases: DisorderedArray<IUICanvas>;
    if (isOverlay) {
      canvases = this._overlayCanvases;
      this._overlayCanvasesSortingFlag = true;
    } else {
      canvases = this._canvases;
    }
    const replaced = canvases.deleteByIndex(uiCanvas._canvasIndex);
    replaced && (replaced._canvasIndex = uiCanvas._canvasIndex);
    uiCanvas._canvasIndex = -1;
  }

  sortUICanvases(): void {
    if (this._overlayCanvasesSortingFlag) {
      const overlayCanvases = this._overlayCanvases;
      overlayCanvases.sort((a, b) => a.sortOrder - b.sortOrder);
      for (let i = 0, n = overlayCanvases.length; i < n; i++) {
        overlayCanvases.get(i)._canvasIndex = i;
      }
      this._overlayCanvasesSortingFlag = false;
    }
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

  addOnUpdateAnimations(animation: Animator): void {
    animation._onUpdateIndex = this._onUpdateAnimations.length;
    this._onUpdateAnimations.add(animation);
  }

  removeOnUpdateAnimations(animation: Animator): void {
    const replaced = this._onUpdateAnimations.deleteByIndex(animation._onUpdateIndex);
    replaced && (replaced._onUpdateIndex = animation._onUpdateIndex);
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

  addOnUpdateUIElement(element: IUIElement): void {
    element._onUIUpdateIndex = this._onUpdateRenderers.length;
    this._onUpdateUIElements.add(element);
  }

  removeOnUpdateUIElement(element: IUIElement): void {
    const replaced = this._onUpdateUIElements.deleteByIndex(element._onUIUpdateIndex);
    replaced && (replaced._onUIUpdateIndex = element._onUIUpdateIndex);
    element._onUIUpdateIndex = -1;
  }

  addPendingDestroyScript(component: Script): void {
    this._pendingDestroyScripts.push(component);
  }

  callScriptOnStart(): void {
    const onStartScripts = this._onStartScripts;
    if (onStartScripts.length > 0) {
      // The 'onStartScripts.length' maybe add if you add some Script with addComponent() in some Script's onStart()
      onStartScripts.forEachAndClean(
        (script: Script) => {
          script._started = true;
          this.removeOnStartScript(script);
          script.onStart();
        },
        (element: Script, index: number) => {
          element._onStartIndex = index;
        }
      );
    }
  }

  callScriptOnUpdate(deltaTime: number): void {
    this._onUpdateScripts.forEach(
      (element: Script) => {
        element._started && element.onUpdate(deltaTime);
      },
      (element: Script, index: number) => {
        element._onUpdateIndex = index;
      }
    );
  }

  callScriptOnLateUpdate(deltaTime: number): void {
    this._onLateUpdateScripts.forEach(
      (element: Script) => {
        element._started && element.onLateUpdate(deltaTime);
      },
      (element: Script, index: number) => {
        element._onLateUpdateIndex = index;
      }
    );
  }

  callScriptOnPhysicsUpdate(): void {
    this._onPhysicsUpdateScripts.forEach(
      (element: Script) => {
        element._started && element.onPhysicsUpdate();
      },
      (element: Script, index: number) => {
        element._onPhysicsUpdateIndex = index;
      }
    );
  }

  callAnimationUpdate(deltaTime: number): void {
    this._onUpdateAnimations.forEach(
      (element: Animator) => {
        element.update(deltaTime);
      },
      (element: Animator, index: number) => {
        element._onUpdateIndex = index;
      }
    );
  }

  callRendererOnUpdate(deltaTime: number): void {
    this._onUpdateRenderers.forEach(
      (element: Renderer) => {
        element.update(deltaTime);
      },
      (element: Renderer, index: number) => {
        element._onUpdateIndex = index;
      }
    );
  }

  callUIOnUpdate(deltaTime: number): void {
    this._onUpdateUIElements.forEach((element: IUIElement) => {
      element._onUpdate();
    });
  }

  handlingInvalidScripts(): void {
    const { _disposeDestroyScripts: pendingDestroyScripts, _pendingDestroyScripts: disposeDestroyScripts } = this;
    this._disposeDestroyScripts = disposeDestroyScripts;
    this._pendingDestroyScripts = pendingDestroyScripts;
    const length = disposeDestroyScripts.length;
    if (length > 0) {
      for (let i = length - 1; i >= 0; i--) {
        disposeDestroyScripts[i].onDestroy();
      }
      disposeDestroyScripts.length = 0;
    }
  }

  callCameraOnBeginRender(camera: Camera): void {
    camera.entity._scripts.forEach(
      (element: Script) => {
        element.onBeginRender(camera);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
  }

  callCameraOnEndRender(camera: Camera): void {
    camera.entity._scripts.forEach(
      (element: Script) => {
        element.onEndRender(camera);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
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
    this._activeCameras.garbageCollection();
    this._overlayCanvases.garbageCollection();
    this._canvases.garbageCollection();
  }
}
