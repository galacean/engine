import { NodeAbility } from "./NodeAbility";
import { Script } from "./Script";

/**
 * @internal
 */

export class ComponentsManager {
  private _onUpdateScripts: Array<Script> = [];
  private _onLateUpdateScripts: Array<Script> = [];
  private _onPreRenderScripts: Array<Script> = [];
  private _onPostRenderScripts: Array<Script> = [];

  addScript(funcName: string, script: Script): void {
    switch (funcName) {
      case "onUpdate":
        this._onUpdateScripts.push(script);
        break;
      case "onLateUpdate":
        this._onLateUpdateScripts.push(script);
        break;
      case "onPreRender":
        this._onPreRenderScripts.push(script);
        break;
      case "onPostRender":
        this._onPostRenderScripts.push(script);
        break;
    }
  }

  removeScript(funcName, script: Script): void {
    let scripts = [];
    switch (funcName) {
      case "onUpdate":
        scripts = this._onUpdateScripts;
        break;
      case "onLateUpdate":
        scripts = this._onLateUpdateScripts;
        break;
      case "onPreRender":
        scripts = this._onPreRenderScripts;
        break;
      case "onPostRender":
        scripts = this._onPostRenderScripts;
        break;
    }
    const index = scripts.indexOf(script);
    if (index < 0) {
      return;
    }
    scripts.splice(index, 1);
  }

  callComponentMethod(funcName: string, ...args): void {
    let length = 0;
    switch (funcName) {
      case "onUpdate":
        length = this._onUpdateScripts.length;
        for (let i = length - 1; i >= 0; --i) {
          const script = this._onUpdateScripts[i];
          if (script._ownerNode.activeInHierarchy && script.enabled) {
            if (!script._started) {
              script.onStart.apply(script, args);
            }
            script.onUpdate.apply(script, args);
          }
        }
        break;
      case "onLateUpdate":
        length = this._onLateUpdateScripts.length;
        for (let i = length - 1; i >= 0; --i) {
          const script = this._onUpdateScripts[i];
          if (script._ownerNode.activeInHierarchy && script.enabled) {
            script.onLateUpdate.apply(script, args);
          }
        }
        break;
      case "onPreRender":
        length = this._onPreRenderScripts.length;
        for (let i = length - 1; i >= 0; --i) {
          const script = this._onUpdateScripts[i];
          if (script._ownerNode.activeInHierarchy && script.enabled) {
            script.onPreRender.apply(script, args);
          }
        }
        break;
      case "onPostRender":
        length = this._onPostRenderScripts.length;
        for (let i = length - 1; i >= 0; --i) {
          const script = this._onUpdateScripts[i];
          if (script._ownerNode.activeInHierarchy && script.enabled) {
            script.onPostRender.apply(script, args);
          }
        }
        break;
    }
  }
}
