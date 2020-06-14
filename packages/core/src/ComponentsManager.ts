import { ACamera } from "./ACamera";
import { NodeAbility as Component } from "./NodeAbility";
import { RenderableComponent } from "./RenderableComponent";
import { Script } from "./Script";
import { DisorderedArray } from "./DisorderedArray";
/**
 *
 */
export class ComponentsManager {
  // 延时处理对象池
  public _componentsContainerPool: Component[][] = [];

  // 生命周期
  private _onUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onLateUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onPreRenderScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onPostRenderScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onUpdateAnimations: DisorderedArray<Component> = new DisorderedArray();

  // 其他组件
  private _onUpdateComponents: DisorderedArray<Component> = new DisorderedArray();

  // render
  private _renderers: DisorderedArray<RenderableComponent> = new DisorderedArray();
  private _onUpdateRenderers: DisorderedArray<RenderableComponent> = new DisorderedArray();

  // 延时销毁
  private _destoryComponents: Component[] = [];

  addOnUpdateComponents(component: Component): void {
    this._onUpdateComponents.push(component);
  }

  removeOnUpdateComponent(component: Component): void {
    this._onUpdateComponents.delete(component);
  }

  addRenderer(renderer: RenderableComponent) {
    this._renderers.push(renderer);
  }

  removeRenderer(renderer: Component) {
    this._renderers.delete(renderer);
  }

  addOnUpdateScript(script: Script) {
    this._onUpdateScripts.push(script);
  }

  removeOnUpdateScript(script: Script): void {
    this._onUpdateScripts.delete(script);
  }

  addOnLateUpdateScript(script: Script) {
    this._onLateUpdateScripts.push(script);
  }

  removeOnLateUpdateScript(script: Script) {
    this._onLateUpdateScripts.delete(script);
  }

  addOnPreRenderScript(script: Script) {
    this._onPreRenderScripts.push(script);
  }

  removeOnPreRenderScript(script: Script) {
    this._onPreRenderScripts.delete(script);
  }

  addOnPostRenderScript(script: Script) {
    this._onLateUpdateScripts.push(script);
  }

  removeOnPostRenderScript(script: Script): void {
    this._onPostRenderScripts.delete(script);
  }

  addOnUpdateAnimations(animation: Component): void {
    this._onUpdateAnimations.push(animation);
  }

  removeOnUpdateAnimations(animation: Component): void {
    this._onUpdateAnimations.delete(animation);
  }

  addOnUpdateRenderers(renderer: RenderableComponent): void {
    this._onUpdateRenderers.push(renderer);
  }

  removeOnUpdateRenderers(renderer: RenderableComponent): void {
    this._onUpdateRenderers.delete(renderer);
  }

  addDestoryComponents(component): void {
    this._destoryComponents.push(component);
  }

  callScriptOnUpdate(deltaTime): void {
    const onUpdateScripts = this._onUpdateScripts;
    for (let i = onUpdateScripts.length - 1; i >= 0; --i) {
      const script = onUpdateScripts[i];
      if (script.enabled) {
        if (!script._started) {
          script._started = true;
          script.onStart();
        }
        script.onUpdate(deltaTime);
      }
    }
  }

  callScriptOnLateUpdate(): void {
    const length = this._onLateUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onLateUpdateScripts[i];
      if (script.enabled) {
        script.onLateUpdate();
      }
    }
  }

  callScriptOnPreRender(): void {
    const length = this._onPreRenderScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onPreRenderScripts[i];
      if (script.enabled) {
        script.onPreRender();
      }
    }
  }

  callScriptOnPostRender(): void {
    const length = this._onPostRenderScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onPostRenderScripts[i];
      if (script.enabled) {
        script.onPostRender();
      }
    }
  }

  callAnimationOnUpdate(deltaTime): void {
    const onUpdateAnimations = this._onUpdateAnimations;
    for (let i = onUpdateAnimations.length - 1; i >= 0; --i) {
      const animation = onUpdateAnimations[i];
      if (animation.enabled) {
        animation.onUpdate(deltaTime);
      }
    }
  }

  callRendererOnUpdate(): void {
    const onUpdateRenderers = this._onUpdateRenderers;
    for (let i = onUpdateRenderers.length - 1; i >= 0; --i) {
      const renderer = onUpdateRenderers[i];
      if (renderer.enabled) {
        if (!renderer._started) {
          renderer._started = true;
          renderer.onStart();
        }
        renderer.onUpdate();
      }
    }
  }

  callComponentOnUpdate(deltaTime): void {
    const onUpdateComponents = this._onUpdateComponents;
    for (let i = onUpdateComponents.length - 1; i >= 0; --i) {
      const component = onUpdateComponents[i];
      if (component.enabled) {
        if (!component._started) {
          component._started = true;
          component.onStart();
        }
        component.onUpdate(deltaTime);
      }
    }
  }

  callComponentDestory(): void {
    const destoryComponents = this._destoryComponents;
    for (let i = destoryComponents.length - 1; i >= 0; --i) {
      destoryComponents[i].onDestroy();
    }
  }

  callRender(camera: ACamera): void {
    const renders = this._renderers;
    for (let i = renders.length - 1; i >= 0; --i) {
      const renderer = renders[i];
      if (renderer.enabled) {
        renderer._render(camera);
      }
    }
  }

  clear() {
    this._clearRenderers();
    this._clearScripts(); //CM:好像没有需要clear的场景
    this._clearAnimations();
    this._clearComponents();
  }

  _clearScripts() {
    let length = this._onUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onUpdateScripts[i];
      if (!script._destroied) {
        script._onDestroy();
      }
    }
    this._onUpdateScripts.length = 0;
    length = this._onLateUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onLateUpdateScripts[i];
      if (!script._destroied) {
        script._onDestroy();
      }
    }
    this._onLateUpdateScripts.length = 0;
    length = this._onPreRenderScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onPreRenderScripts[i];
      if (!script._destroied) {
        script._onDestroy();
      }
    }
    this._onPreRenderScripts.length = 0;
    length = this._onPostRenderScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onPostRenderScripts[i];
      if (!script._destroied) {
        script._onDestroy();
      }
    }
    this._onPostRenderScripts.length = 0;
  }

  _clearAnimations() {
    let length = this._onUpdateAnimations.length;
    for (let i = length - 1; i >= 0; --i) {
      const animation = this._onUpdateAnimations[i];
      if (!animation._destroied) {
        animation._onDestroy();
      }
    }
    this._onUpdateAnimations.length = 0;
  }

  _clearComponents() {
    let length = this._onUpdateComponents.length;
    for (let i = length - 1; i >= 0; --i) {
      const component = this._onUpdateComponents[i];
      if (!component._destroied) {
        component._onDestroy();
      }
    }
    this._onUpdateComponents.length = 0;
  }

  _clearRenderers() {
    let length = this._renderers.length;
    for (let i = length - 1; i >= 0; --i) {
      const renderer = this._renderers[i];
      if (!renderer._destroied) {
        renderer._onDestroy();
      }
    }
    this._renderers.length = 0;
  }

  _getTempList() {
    if (this._componentsContainerPool.length) {
      const componentContainer = this._componentsContainerPool.pop();
      return componentContainer;
    } else {
      const componentContainer: Component[] = [];
      return componentContainer;
    }
  }

  _putTempList(componentContainer: Component[]) {
    this._componentsContainerPool.push(componentContainer);
  }
}
