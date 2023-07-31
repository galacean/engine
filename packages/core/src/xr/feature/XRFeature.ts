import { Engine } from "../../Engine";

export abstract class XRFeature {
  protected _engine: Engine;

  /**
   * Enable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onEnable(): void {}

  /**
   * Disable an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onDisable(): void {}

  /**
   * Update an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onUpdate(): void {}

  /**
   * Destroy an instance of a feature.
   * This method needs to be override.
   * @returns
   */
  onDestroy(): void {}

  constructor(engine: Engine) {
    this._engine = engine;
  }
}
