import { Component, Loader } from "@galacean/engine";
/** Scene-owned, one-shot population initializer. Its generated buildings become
 * ordinary authored children. Deleting children never reruns generation. */
export class BuildingGeneratorComponent extends Component {
  private _initialized = false;
  get initialized() {
    return this._initialized;
  }
  set initialized(value: boolean) {
    if (typeof value !== "boolean") throw Error("Building initialization must be boolean");
    this._initialized = value;
  }
}
Loader.registerClass("BuildingGeneratorComponent", BuildingGeneratorComponent);
