import { ACamera } from "./ACamera";
import { NodeAbility as Component } from "./NodeAbility";
import { RenderableComponent } from "./RenderableComponent";
import { Script } from "./Script";
import { DisorderedArray } from "./DisorderedArray";

/**
 * 组件的管理员。
 */
export class ComponentsManager {
  // 生命周期
  private _onUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onLateUpdateScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onPreRenderScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onPostRenderScripts: DisorderedArray<Script> = new DisorderedArray();
  private _onUpdateAnimations: DisorderedArray<Component> = new DisorderedArray();

  // 其他组件 @deprecated
  private _onUpdateComponents: DisorderedArray<Component> = new DisorderedArray();

  // render
  private _renderers: DisorderedArray<RenderableComponent> = new DisorderedArray();
  private _onUpdateRenderers: DisorderedArray<RenderableComponent> = new DisorderedArray();

  // 延时销毁
  private _destoryComponents: Script[] = [];

  // 延时处理对象池
  private _componentsContainerPool: Component[][] = [];

  addOnUpdateComponent(component: Component): void {
    this._onUpdateComponents.add(component);
  }

  removeOnUpdateComponent(component: Component): void {
    this._onUpdateComponents.delete(component);
  }

  addRenderer(renderer: RenderableComponent) {
    this._renderers.add(renderer);
  }

  removeRenderer(renderer: RenderableComponent) {
    this._renderers.delete(renderer);
  }

  addOnUpdateScript(script: Script) {
    this._onUpdateScripts.add(script);
  }

  removeOnUpdateScript(script: Script): void {
    this._onUpdateScripts.delete(script);
  }

  addOnLateUpdateScript(script: Script): void {
    this._onLateUpdateScripts.add(script);
  }

  removeOnLateUpdateScript(script: Script): void {
    this._onLateUpdateScripts.delete(script);
  }

  addOnPreRenderScript(script: Script): void {
    this._onPreRenderScripts.add(script);
  }

  removeOnPreRenderScript(script: Script): void {
    this._onPreRenderScripts.delete(script);
  }

  addOnPostRenderScript(script: Script): void {
    this._onPostRenderScripts.add(script);
  }

  removeOnPostRenderScript(script: Script): void {
    this._onPostRenderScripts.delete(script);
  }

  addOnUpdateAnimations(animation: Component): void {
    this._onUpdateAnimations.add(animation);
  }

  removeOnUpdateAnimations(animation: Component): void {
    this._onUpdateAnimations.delete(animation);
  }

  addOnUpdateRenderers(renderer: RenderableComponent): void {
    this._onUpdateRenderers.add(renderer);
  }

  removeOnUpdateRenderers(renderer: RenderableComponent): void {
    this._onUpdateRenderers.delete(renderer);
  }

  addDestoryComponent(component): void {
    this._destoryComponents.push(component);
  }

  callScriptOnUpdate(deltaTime): void {
    const elements = this._onUpdateScripts._elements;
    for (let i = this._onUpdateScripts.length - 1; i >= 0; --i) {
      const script = elements[i];
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
    const elements = this._onLateUpdateScripts._elements;
    for (let i = this._onLateUpdateScripts.length - 1; i >= 0; --i) {
      const script = elements[i];
      if (script.enabled) {
        script.onLateUpdate();
      }
    }
  }

  callScriptOnPreRender(): void {
    const elements = this._onPreRenderScripts._elements;
    for (let i = this._onPreRenderScripts.length - 1; i >= 0; --i) {
      const script = elements[i];
      if (script.enabled) {
        script.onPreRender();
      }
    }
  }

  callScriptOnPostRender(): void {
    const elements = this._onPostRenderScripts._elements;
    for (let i = this._onPostRenderScripts.length - 1; i >= 0; --i) {
      const script = this._onPostRenderScripts[i];
      if (script.enabled) {
        script.onPostRender();
      }
    }
  }

  callAnimationOnUpdate(deltaTime): void {
    const elements = this._onUpdateAnimations._elements;
    for (let i = this._onUpdateAnimations.length - 1; i >= 0; --i) {
      const animation = elements[i];
      if (animation.enabled) {
        animation.onUpdate(deltaTime);
      }
    }
  }

  callRendererOnUpdate(): void {
    const elements = this._onUpdateRenderers._elements;
    for (let i = this._onUpdateRenderers.length - 1; i >= 0; --i) {
      const renderer = elements[i];
      if (renderer.enabled) {
        if (!renderer._started) {
          renderer._started = true;
          renderer.onStart();
        }
        renderer.onUpdate();
      }
    }
  }

  callRender(camera: ACamera): void {
    const elements = this._renderers._elements;
    for (let i = this._renderers.length - 1; i >= 0; --i) {
      const renderer = elements[i];
      if (renderer.enabled) {
        renderer._render(camera);
      }
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

  /**
   * @deprecated
   */
  callComponentOnUpdate(deltaTime): void {
    const elements = this._onUpdateComponents._elements;
    for (let i = this._onUpdateComponents.length - 1; i >= 0; --i) {
      const component = elements[i];
      if (component.enabled) {
        if (!component._started) {
          component._started = true;
          component.onStart();
        }
        component.onUpdate(deltaTime);
      }
    }
  }

  _getTempList(): Component[] {
    if (this._componentsContainerPool.length) {
      return this._componentsContainerPool.pop();
    } else {
      return [];
    }
  }

  _putTempList(componentContainer: Component[]): void {
    componentContainer.length = 0;
    this._componentsContainerPool.push(componentContainer);
  }
}
