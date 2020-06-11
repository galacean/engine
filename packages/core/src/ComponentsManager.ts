import { ACamera } from "./ACamera";
import { NodeAbility as Component } from "./NodeAbility";
import { RenderableComponent } from "./RenderableComponent";
import { Script } from "./Script";

/**
 *
 */
export class ComponentsManager {
  private _onUpdateScripts: Array<Script> = [];
  private _onLateUpdateScripts: Array<Script> = [];
  private _onPreRenderScripts: Array<Script> = [];
  private _onPostRenderScripts: Array<Script> = [];
  private _onUpdateAnimations: Array<Component> = [];

  // 其他组件
  private _onUpdateComponents: Array<Component> = [];
  // render
  private _renderers: Array<RenderableComponent> = [];

  addOnUpdateComponents(component: Component): void {
    this._onUpdateComponents.push(component);
  }

  removeOnUpdateComponent(component: Component): void {
    this._removeComponentFromArray(this._onUpdateComponents, component);
  }

  addRenderer(renderer: RenderableComponent) {
    this._renderers.push(renderer);
  }

  removeRenderer(renderer: Component) {
    this._removeComponentFromArray(this._renderers, renderer);
  }

  addOnUpdateScript(script: Script) {
    this._onUpdateScripts.push(script);
  }

  removeOnUpdateScript(script: Script): void {
    this._removeComponentFromArray(this._onUpdateScripts, script);
  }

  addOnLateUpdateScript(script: Script) {
    this._onLateUpdateScripts.push(script);
  }

  removeOnLateUpdateScript(script: Script) {
    this._removeComponentFromArray(this._onLateUpdateScripts, script);
  }

  addOnPreRenderScript(script: Script) {
    this._onPreRenderScripts.push(script);
  }

  removeOnPreRenderScript(script: Script) {
    this._removeComponentFromArray(this._onPreRenderScripts, script);
  }

  addOnPostRenderScript(script: Script) {
    this._onLateUpdateScripts.push(script);
  }

  removeOnPostRenderScript(script: Script): void {
    this._removeComponentFromArray(this._onPostRenderScripts, script);
  }

  addOnUpdateAnimations(animation: Component): void {
    this._onUpdateAnimations.push(animation);
  }

  removeOnUpdateAnimations(animation: Component): void {
    this._removeComponentFromArray(this._onUpdateAnimations, animation);
  }

  callScriptOnUpdate(deltaTime): void {
    const length = this._onUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onUpdateScripts[i];
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
    const length = this._onUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onUpdateScripts[i]; //CM:是不是写错了
      if (script.enabled) {
        script.onLateUpdate();
      }
    }
  }

  callScriptOnPreRender(): void {
    const length = this._onUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onUpdateScripts[i]; //CM:是不是写错了
      if (script.enabled) {
        script.onPreRender();
      }
    }
  }

  callScriptOnPostRender(): void {
    const length = this._onUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onUpdateScripts[i]; //CM:是不是写错了
      if (script.enabled) {
        script.onPostRender();
      }
    }
  }

  callAnimationOnUpdate(deltaTime): void {
    const onUpdateAnimations = this._onUpdateAnimations;
    const length = this._onUpdateAnimations.length;
    for (let i = length - 1; i >= 0; --i) {
      const animation = onUpdateAnimations[i];
      if (animation.enabled) {
        animation.onUpdate(deltaTime);
      }
    }
  }

  callComponentOnUpdate(deltaTime): void {
    const length = this._onUpdateComponents.length;
    for (let i = length - 1; i >= 0; --i) {
      const component = this._onUpdateComponents[i];
      if (component.enabled) {
        if (!component._started) {
          component._started = true;
          component.onStart();
        }
        component.onUpdate(deltaTime);
      }
    }
  }

  callRender(camera: ACamera): void {
    const length = this._renderers.length;
    for (let i = length - 1; i >= 0; --i) {
      const renderer = this._renderers[i];
      if (renderer.enabled) {
        renderer._render(camera);
      }
    }
  }

  clear() {
    this._clearScripts();
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
    this._onUpdateScripts = [];
    length = this._onLateUpdateScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onLateUpdateScripts[i];
      if (!script._destroied) {
        script._onDestroy();
      }
    }
    this._onLateUpdateScripts = [];
    length = this._onPreRenderScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onPreRenderScripts[i];
      if (!script._destroied) {
        script._onDestroy();
      }
    }
    this._onPreRenderScripts = [];
    length = this._onPostRenderScripts.length;
    for (let i = length - 1; i >= 0; --i) {
      const script = this._onPostRenderScripts[i];
      if (!script._destroied) {
        script._onDestroy();
      }
    }
    this._onPostRenderScripts = [];
  }

  _clearComponents() {
    let length = this._onUpdateComponents.length;
    for (let i = length - 1; i >= 0; --i) {
      const component = this._onUpdateComponents[i];
      if (!component._destroied) {
        component._onDestroy();
      }
    }
    this._onUpdateComponents = [];
  }

  _removeComponentFromArray(components: Component[], component: Component) {
    const index = components.indexOf(component);
    components.splice(index, 1);
  }
}
