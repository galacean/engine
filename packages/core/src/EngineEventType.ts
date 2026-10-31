/**
 * Engine event type.
 */
export enum EngineEventType {
  /** Dispatched when the engine starts running. */
  Run = "run",
  /** Dispatched when the engine shuts down. */
  Shutdown = "shutdown",
  /** Dispatched when the graphic device is lost. */
  DeviceLost = "devicelost",
  /** Dispatched when the graphic device is restored. */
  DeviceRestored = "devicerestored"
}
