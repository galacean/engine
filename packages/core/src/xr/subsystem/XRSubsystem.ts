import { Engine } from "../../Engine";

export abstract class XRSubsystem {
  // Whether or not the subsystem is running.
  running: boolean = false;

  _engine: Engine;

  /**
   * Starts an instance of a system.
   * This method needs to be override.
   * @returns
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      resolve();
    });
  }

  /**
   * Stops an instance of a system.
   * This method needs to be override.
   * @returns
   */
  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      resolve();
    });
  }

  /**
   * Destroys this instance of a system.
   * This method needs to be override.
   * @returns
   */
  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      resolve();
    });
  }

  /**
   * Update this instance of a system.
   * This method needs to be override.
   * @returns
   */
  update(): void {}

  constructor(engine: Engine) {
    this._engine = engine;
  }
}
